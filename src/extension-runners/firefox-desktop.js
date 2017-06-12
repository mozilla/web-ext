/* @flow */

// Import flow types from npm dependencies.
import type FirefoxProfile from 'firefox-profile';

import {
  MultipleExtensionsReloadError,
  RemoteTempInstallNotSupported,
  WebExtError,
} from '../errors';
import * as defaultFirefoxApp from '../firefox';
import {
  connectWithMaxRetries as defaultFirefoxConnector,
} from '../firefox/remote';
import {createLogger} from '../util/logger';
// Import flow types from project files.
import type {
  FirefoxRDPResponseAddon,
  RemoteFirefox,
} from '../firefox/remote';
import type {
  ExtensionRunnerParams,
  ExtensionRunnerReloadResult,
} from './base';
import type {
  FirefoxPreferences,
} from '../firefox/preferences';
import type {
  FirefoxInfo, // eslint-disable-line import/named
} from '../firefox/index';

type FirefoxDesktopSpecificRunnerParams = {|
  customPrefs?: FirefoxPreferences,
  browserConsole: boolean,
  firefoxBinary: string,
  preInstall: boolean,

  // Firefox desktop injected dependencies.
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxConnector,
|};

export type FirefoxDesktopExtensionRunnerParams = {|
  ...ExtensionRunnerParams,
  // Firefox desktop CLI params.
  ...FirefoxDesktopSpecificRunnerParams,
|};

const log = createLogger(__filename);

/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Firefox for Desktop instance.
 */

export class FirefoxDesktopExtensionRunner {
  params: FirefoxDesktopExtensionRunnerParams;
  reloadableExtensions: Map<string, string>;
  cleanupCallbacks: Set<Function>;
  profile: FirefoxProfile;
  runningInfo: FirefoxInfo;
  remoteFirefox: RemoteFirefox;

  constructor(params: FirefoxDesktopExtensionRunnerParams) {
    this.params = params;

    this.reloadableExtensions = new Map();
    this.cleanupCallbacks = new Set();
  }

  getName() {
    return 'Firefox Desktop';
  }

  // Method exported from the IExtensionRunner interface.

  async run(): Promise<void> {
    // Get a firefox profile with the custom Prefs set (a new or a cloned one).
    // Pre-install extensions as proxy if needed (and disable auto-reload if you do)
    await this.setupProfileDir();

    // (if reload is enabled):
    // - Connect to the firefox instance on RDP
    // - Install any extension if needed (if not installed as proxy)
    // - Keep track of the extension id assigned in a map with the sourceDir as a key
    await this.startFirefoxInstance();
  }

  async reloadAllExtensions(): Promise<Array<ExtensionRunnerReloadResult>> {
    const runnerName = this.getName();
    const reloadErrors = new Map();
    for (const {sourceDir} of this.params.extensions) {
      const [res] = await this.reloadExtensionBySourceDir(sourceDir);
      if (res.reloadError instanceof Error) {
        reloadErrors.set(sourceDir, res.reloadError);
      }
    }

    if (reloadErrors.size > 0) {
      return [{
        runnerName,
        reloadError: new MultipleExtensionsReloadError(reloadErrors),
      }];
    }

    return [{runnerName}];
  }

  async reloadExtensionBySourceDir(
    extensionSourceDir: string
  ): Promise<Array<ExtensionRunnerReloadResult>> {
    const runnerName = this.getName();
    const addonId = this.reloadableExtensions.get(extensionSourceDir);

    if (!addonId) {
      return [{
        sourceDir: extensionSourceDir,
        reloadError: new WebExtError('Extension not reloadable'),
        runnerName,
      }];
    }

    try {
      await this.remoteFirefox.reloadAddon(addonId);
    } catch (error) {
      return [{
        sourceDir: extensionSourceDir,
        reloadError: error,
        runnerName,
      }];
    }

    return [{runnerName, sourceDir: extensionSourceDir}];
  }

  registerCleanup(fn: Function): void {
    this.cleanupCallbacks.add(fn);
  }

  async exit(): Promise<void> {
    if (!this.runningInfo || !this.runningInfo.firefox) {
      throw new WebExtError('No firefox instance is currently running');
    }

    this.runningInfo.firefox.kill();
  }

  // Private methods.

  async setupProfileDir() {
    const {
      customPrefs,
      extensions,
      keepProfileChanges,
      preInstall,
      profilePath,
      firefoxApp,
    } = this.params;

    if (profilePath) {
      if (keepProfileChanges) {
        log.debug(`Using Firefox profile from ${profilePath}`);
        this.profile = await firefoxApp.useProfile(profilePath, {customPrefs});
      } else {
        log.debug(`Copying Firefox profile from ${profilePath}`);
        this.profile = await firefoxApp.copyProfile(profilePath, {customPrefs});
      }
    } else {
      log.debug('Creating new Firefox profile');
      this.profile = await firefoxApp.createProfile({customPrefs});
    }

    // preInstall the extensions if needed.
    if (preInstall) {
      for (const extension of extensions) {
        await firefoxApp.installExtension({
          asProxy: true,
          extensionPath: extension.sourceDir,
          manifestData: extension.manifestData,
          profile: this.profile,
        });
      }
    }
  }

  async startFirefoxInstance() {
    const {
      browserConsole,
      extensions,
      firefoxBinary,
      preInstall,
      startUrl,
      firefoxApp,
      firefoxClient,
    } = this.params;

    const binaryArgs = [];

    if (browserConsole) {
      binaryArgs.push('-jsconsole');
    }
    if (startUrl) {
      const urls = Array.isArray(startUrl) ? startUrl : [startUrl];
      for (const url of urls) {
        binaryArgs.push('--url', url);
      }
    }

    this.runningInfo = await firefoxApp.run(this.profile, {
      firefoxBinary, binaryArgs,
    });

    this.runningInfo.firefox.on('close', () => {
      for (const fn of this.cleanupCallbacks) {
        try {
          fn();
        } catch (error) {
          log.debug(`Exception on executing cleanup callback: ${error}`);
        }
      }
    });

    if (!preInstall) {
      const remoteFirefox = this.remoteFirefox = await firefoxClient({
        port: this.runningInfo.debuggerPort,
      });

      // Install all the temporary addons.
      for (const extension of extensions) {
        try {
          const addonId = await (
            remoteFirefox.installTemporaryAddon(extension.sourceDir)
              .then((installResult: FirefoxRDPResponseAddon) => {
                return installResult.addon.id;
              })
          );

          if (!addonId) {
            throw new WebExtError(
              'Unexpected missing addonId in the installAsTemporaryAddon result'
            );
          }

          this.reloadableExtensions.set(extension.sourceDir, addonId);
        } catch (error) {
          if (error instanceof RemoteTempInstallNotSupported) {
            log.debug(`Caught: ${error}`);
            throw new WebExtError(
              'Temporary add-on installation is not supported in this version' +
              ' of Firefox (you need Firefox 49 or higher). For older Firefox' +
              ' versions, use --pre-install'
            );
          } else {
            throw error;
          }
        }
      }
    }
  }
}

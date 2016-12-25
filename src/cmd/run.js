/* @flow */
import type FirefoxProfile from 'firefox-profile';
import type Watchpack from 'watchpack';

import * as defaultFirefoxApp from '../firefox';
import defaultFirefoxConnector from '../firefox/remote';
import {
  isErrorWithCode,
  RemoteTempInstallNotSupported,
  WebExtError,
} from '../errors';
import {createLogger} from '../util/logger';
import getValidatedManifest, {getManifestId} from '../util/manifest';
import defaultSourceWatcher from '../watcher';
// Import objects that are only used as Flow types.
import type {FirefoxPreferences} from '../firefox/preferences';
import type {OnSourceChangeFn} from '../watcher';
import type {
  FirefoxProcess, // eslint-disable-line import/named
} from '../firefox/index';
import type {
  FirefoxConnectorFn, RemoteFirefox,
  FirefoxRDPResponseAddon,
} from '../firefox/remote';
import type {ExtensionManifest} from '../util/manifest';

const log = createLogger(__filename);

// defaultWatcherCreator types and implementation.

export type WatcherCreatorParams = {
  addonId: string,
  client: RemoteFirefox,
  sourceDir: string,
  artifactsDir: string,
  onSourceChange?: OnSourceChangeFn,
};

export type WatcherCreatorFn = (params: WatcherCreatorParams) => Watchpack;

export function defaultWatcherCreator(
  {
    addonId, client, sourceDir, artifactsDir,
    onSourceChange = defaultSourceWatcher,
  }: WatcherCreatorParams
 ): Watchpack {
  return onSourceChange({
    sourceDir,
    artifactsDir,
    onChange: () => {
      log.debug(`Reloading add-on ID ${addonId}`);
      return client.reloadAddon(addonId)
        .catch((error) => {
          log.error('\n');
          log.error(error.stack);
          throw error;
        });
    },
  });
}


// defaultReloadStrategy types and implementation.

export type ReloadStrategyParams = {
  addonId: string,
  firefoxProcess: FirefoxProcess,
  client: RemoteFirefox,
  profile: FirefoxProfile,
  sourceDir: string,
  artifactsDir: string,
};

export type ReloadStrategyOptions = {
  createWatcher?: WatcherCreatorFn,
};

export function defaultReloadStrategy(
  {
    addonId, firefoxProcess, client, profile, sourceDir, artifactsDir,
  }: ReloadStrategyParams,
  {
    createWatcher = defaultWatcherCreator,
  }: ReloadStrategyOptions = {}
): void {
  const watcher: Watchpack = (
    createWatcher({addonId, client, sourceDir, artifactsDir})
  );

  firefoxProcess.on('close', () => {
    client.disconnect();
    watcher.close();
  });

}


// defaultFirefoxClient types and implementation.

export type CreateFirefoxClientParams = {
  connectToFirefox?: FirefoxConnectorFn,
  maxRetries: number,
  retryInterval: number,
};

export function defaultFirefoxClient(
  {
    connectToFirefox = defaultFirefoxConnector,
    // A max of 250 will try connecting for 30 seconds.
    maxRetries = 250, retryInterval = 120,
  }: CreateFirefoxClientParams = {}
): Promise<RemoteFirefox> {
  async function establishConnection() {
    var lastError;

    for (let retries = 0; retries <= maxRetries; retries++) {
      try {
        return await connectToFirefox();
      } catch (error) {
        if (isErrorWithCode('ECONNREFUSED', error)) {
          // Wait for `retryInterval` ms.
          await new Promise((resolve) => {
            setTimeout(resolve, retryInterval);
          });

          lastError = error;
          log.debug(
            `Retrying Firefox (${retries}); connection error: ${error}`);
        } else {
          log.error(error.stack);
          throw error;
        }
      }
    }

    log.debug('Connect to Firefox debugger: too many retries');
    throw lastError;
  }

  log.debug('Connecting to the remote Firefox debugger');
  return establishConnection();
}


// Run command types and implementation.

export type CmdRunParams = {
  sourceDir: string,
  artifactsDir: string,
  firefox: string,
  firefoxProfile: string,
  preInstall: boolean,
  noReload: boolean,
  customPrefs?: FirefoxPreferences,
};

export type CmdRunOptions = {
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxClient,
  reloadStrategy: typeof defaultReloadStrategy,
};

export default async function run(
  {
    sourceDir, artifactsDir, firefox, firefoxProfile,
    preInstall = false, noReload = false,
    customPrefs,
  }: CmdRunParams,
  {
    firefoxApp = defaultFirefoxApp,
    firefoxClient = defaultFirefoxClient,
    reloadStrategy = defaultReloadStrategy,
  }: CmdRunOptions = {}): Promise<Object> {

  log.info(`Running web extension from ${sourceDir}`);
  if (preInstall) {
    log.info('Disabled auto-reloading because it\'s not possible with ' +
             '--pre-install');
    noReload = true;
  }
  // When not pre-installing the extension, we require a remote
  // connection to Firefox.
  const requiresRemote = !preInstall;
  let installed = false;

  let client;
  let addonId;

  const manifestData = await getValidatedManifest(sourceDir);

  const runner = new ExtensionRunner({
    sourceDir,
    firefoxApp,
    firefox,
    manifestData,
    profilePath: firefoxProfile,
    customPrefs,
  });

  const profile = await runner.getProfile();

  if (!preInstall) {
    log.debug('Deferring extension installation until after ' +
              'connecting to the remote debugger');
  } else {
    log.debug('Pre-installing extension as a proxy file');
    addonId = await runner.installAsProxy(profile);
    installed = true;
  }

  const runningFirefox = await runner.run(profile);

  if (installed) {
    log.debug('Not installing as temporary add-on because the ' +
              'add-on was already installed');
  } else if (requiresRemote) {
    client = await firefoxClient();

    try {
      addonId = await runner.installAsTemporaryAddon(client).then(
        (installResult: FirefoxRDPResponseAddon) => installResult.addon.id
      );
    } catch (error) {
      if (error instanceof RemoteTempInstallNotSupported) {
        log.debug(`Caught: ${error}`);
        throw new WebExtError(
          'Temporary add-on installation is not supported in this version ' +
          'of Firefox (you need Firefox 49 or higher). For older Firefox ' +
          'versions, use --pre-install');
      } else {
        throw error;
      }
    }

    if (noReload) {
      log.info('Automatic extension reloading has been disabled');
    } else {
      if (!addonId) {
        throw new WebExtError(
          'Unexpected missing addonId in the installAsTemporaryAddon result'
        );
      }

      log.info('The extension will reload if any source file changes');
      reloadStrategy({
        firefoxProcess: runningFirefox,
        profile,
        client,
        sourceDir,
        artifactsDir,
        addonId,
      });
    }
  }

  return firefoxApp;
}


// ExtensionRunner types and implementation.

export type ExtensionRunnerParams = {
  sourceDir: string,
  manifestData: ExtensionManifest,
  profilePath: string,
  firefoxApp: typeof defaultFirefoxApp,
  firefox: string,
  customPrefs?: FirefoxPreferences,
};

export class ExtensionRunner {
  sourceDir: string;
  manifestData: ExtensionManifest;
  profilePath: string;
  firefoxApp: typeof defaultFirefoxApp;
  firefox: string;
  customPrefs: FirefoxPreferences;

  constructor(
    {
      firefoxApp, sourceDir, manifestData,
      profilePath, firefox, customPrefs = {},
    }: ExtensionRunnerParams
  ) {
    this.sourceDir = sourceDir;
    this.manifestData = manifestData;
    this.profilePath = profilePath;
    this.firefoxApp = firefoxApp;
    this.firefox = firefox;
    this.customPrefs = customPrefs;
  }

  getProfile(): Promise<FirefoxProfile> {
    const {firefoxApp, profilePath, customPrefs} = this;
    return new Promise((resolve) => {
      if (profilePath) {
        log.debug(`Copying Firefox profile from ${profilePath}`);
        resolve(firefoxApp.copyProfile(profilePath, {customPrefs}));
      } else {
        log.debug('Creating new Firefox profile');
        resolve(firefoxApp.createProfile({customPrefs}));
      }
    });
  }

  installAsTemporaryAddon(
    client: RemoteFirefox
  ): Promise<FirefoxRDPResponseAddon> {
    return client.installTemporaryAddon(this.sourceDir);
  }

  installAsProxy(profile: FirefoxProfile): Promise<string | void> {
    const {firefoxApp, sourceDir, manifestData} = this;
    return firefoxApp.installExtension(
      {
        manifestData,
        asProxy: true,
        extensionPath: sourceDir,
        profile,
      })
      .then(() => getManifestId(manifestData));
  }

  run(profile: FirefoxProfile): Promise<FirefoxProcess> {
    const {firefoxApp, firefox} = this;
    return firefoxApp.run(profile, {firefoxBinary: firefox});
  }
}

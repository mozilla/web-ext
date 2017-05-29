/* @flow */
import readline from 'readline';
import tty from 'tty';

import type FirefoxProfile from 'firefox-profile';
import type Watchpack from 'watchpack';

import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import * as defaultFirefoxApp from '../firefox';
import {
  connectWithMaxRetries as defaultFirefoxClient,
} from '../firefox/remote';
import {
  RemoteTempInstallNotSupported,
  WebExtError,
} from '../errors';
import {createLogger} from '../util/logger';
import getValidatedManifest, {getManifestId} from '../util/manifest';
import defaultSourceWatcher from '../watcher';
import {
  createFileFilter as defaultFileFilterCreator,
} from '../util/file-filter';
// Import objects that are only used as Flow types.
import type {FirefoxPreferences} from '../firefox/preferences';
import type {OnSourceChangeFn} from '../watcher';
import type {
  FirefoxProcess, FirefoxInfo, // eslint-disable-line import/named
} from '../firefox/index';
import type {
  RemoteFirefox,
  FirefoxRDPResponseAddon,
} from '../firefox/remote';
import type {ExtensionManifest} from '../util/manifest';
import type {FileFilterCreatorFn} from '../util/file-filter';

const log = createLogger(__filename);

// defaultWatcherCreator types and implementation.

export type WatcherCreatorParams = {|
  addonId: string,
  client: RemoteFirefox,
  sourceDir: string,
  artifactsDir: string,
  onSourceChange?: OnSourceChangeFn,
  ignoreFiles?: Array<string>,
  createFileFilter?: FileFilterCreatorFn,
  addonReload: typeof defaultAddonReload,
|};

export type WatcherCreatorFn = (params: WatcherCreatorParams) => Watchpack;

export function defaultWatcherCreator(
  {
    addonId, addonReload, client, sourceDir, artifactsDir, ignoreFiles,
    onSourceChange = defaultSourceWatcher,
    createFileFilter = defaultFileFilterCreator,
  }: WatcherCreatorParams
 ): Watchpack {
  const fileFilter = createFileFilter(
    {sourceDir, artifactsDir, ignoreFiles}
  );
  return onSourceChange({
    sourceDir,
    artifactsDir,
    onChange: () => addonReload({addonId, client}),
    shouldWatchFile: (file) => fileFilter.wantFile(file),
  });
}

export type ReloadParams = {|
  addonId: string,
  client: RemoteFirefox,
  desktopNotifications?: typeof defaultDesktopNotifications,
|};

export async function defaultAddonReload(
  {
    addonId, client,
    desktopNotifications = defaultDesktopNotifications,
  }: ReloadParams
): Promise<void> {
  log.debug(`Reloading add-on ID ${addonId}`);
  try {
    await client.reloadAddon(addonId);
  } catch (reloadError) {
    log.error('\n');
    log.error(reloadError.stack);
    desktopNotifications({
      title: 'web-ext run: error occurred',
      message: reloadError.message,
    });
    throw reloadError;
  }
}


// defaultReloadStrategy types and implementation.

export type ReloadStrategyParams = {|
  addonId: string,
  firefoxProcess: FirefoxProcess,
  client: RemoteFirefox,
  profile: FirefoxProfile,
  sourceDir: string,
  artifactsDir: string,
  ignoreFiles?: Array<string>,
|};

export type ReloadStrategyOptions = {|
  addonReload?: typeof defaultAddonReload,
  createWatcher?: WatcherCreatorFn,
  createFileFilter?: FileFilterCreatorFn,
  stdin: stream$Readable,
|};

export function defaultReloadStrategy(
  {
    addonId, firefoxProcess, client, profile,
    sourceDir, artifactsDir, ignoreFiles,
  }: ReloadStrategyParams,
  {
    addonReload = defaultAddonReload,
    createWatcher = defaultWatcherCreator,
    stdin = process.stdin,
  }: ReloadStrategyOptions = {}
): void {
  const watcher: Watchpack = createWatcher({
    addonId, addonReload, client, sourceDir, artifactsDir, ignoreFiles,
  });

  firefoxProcess.on('close', () => {
    client.disconnect();
    watcher.close();
    stdin.pause();
  });

  if (stdin.isTTY && stdin instanceof tty.ReadStream) {
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);

    // NOTE: this `Promise.resolve().then(...)` is basically used to spawn a "co-routine" that is executed
    // before the callback attached to the Promise returned by this function (and it allows the `run` function
    // to not be stuck in the while loop).
    Promise.resolve().then(async function() {
      log.info('Press R to reload (and Ctrl-C to quit)');

      let userExit = false;

      while (!userExit) {
        const keyPressed = await new Promise((resolve) => {
          stdin.once('keypress', (str, key) => resolve(key));
        });

        if (keyPressed.ctrl && keyPressed.name === 'c') {
          userExit = true;
        } else if (keyPressed.name === 'r' && addonId) {
          log.debug('Reloading extension on user request');
          await addonReload({addonId, client});
        }
      }

      log.info('\nExiting web-ext on user request');
      firefoxProcess.kill();
    });
  }
}


// Run command types and implementation.

export type CmdRunParams = {|
  sourceDir: string,
  artifactsDir: string,
  firefox: string,
  firefoxProfile: string,
  keepProfileChanges: boolean,
  preInstall: boolean,
  noReload: boolean,
  browserConsole: boolean,
  customPrefs?: FirefoxPreferences,
  startUrl?: string | Array<string>,
  ignoreFiles?: Array<string>,
|};

export type CmdRunOptions = {|
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxClient,
  reloadStrategy: typeof defaultReloadStrategy,
  ExtensionRunnerClass?: typeof ExtensionRunner,
  shouldExitProgram?: boolean,
|};

export default async function run(
  {
    sourceDir, artifactsDir, firefox, firefoxProfile,
    keepProfileChanges = false, preInstall = false, noReload = false,
    browserConsole = false, customPrefs, startUrl, ignoreFiles,
  }: CmdRunParams,
  {
    firefoxApp = defaultFirefoxApp,
    firefoxClient = defaultFirefoxClient,
    reloadStrategy = defaultReloadStrategy,
    ExtensionRunnerClass = ExtensionRunner,
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

  const runner = new ExtensionRunnerClass({
    sourceDir,
    firefoxApp,
    firefox,
    keepProfileChanges,
    browserConsole,
    manifestData,
    profilePath: firefoxProfile,
    customPrefs,
    startUrl,
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

  const { firefox: runningFirefox, debuggerPort } = await runner.run(profile);

  if (installed) {
    log.debug('Not installing as temporary add-on because the ' +
              'add-on was already installed');
  } else if (requiresRemote) {
    client = await firefoxClient({ port: debuggerPort });

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
        ignoreFiles,
      });
    }
  }

  return firefoxApp;
}


// ExtensionRunner types and implementation.

export type ExtensionRunnerParams = {|
  sourceDir: string,
  manifestData: ExtensionManifest,
  profilePath: string,
  keepProfileChanges: boolean,
  firefoxApp: typeof defaultFirefoxApp,
  firefox: string,
  browserConsole: boolean,
  customPrefs?: FirefoxPreferences,
  startUrl?: string | Array<string>,
|};

export class ExtensionRunner {
  sourceDir: string;
  manifestData: ExtensionManifest;
  profilePath: string;
  keepProfileChanges: boolean;
  firefoxApp: typeof defaultFirefoxApp;
  firefox: string;
  browserConsole: boolean;
  customPrefs: FirefoxPreferences;
  startUrl: ?string | ?Array<string>;

  constructor(
    {
      firefoxApp, sourceDir, manifestData,
      profilePath, keepProfileChanges, firefox, browserConsole, startUrl,
      customPrefs = {},
    }: ExtensionRunnerParams
  ) {
    this.sourceDir = sourceDir;
    this.manifestData = manifestData;
    this.profilePath = profilePath;
    this.keepProfileChanges = keepProfileChanges;
    this.firefoxApp = firefoxApp;
    this.firefox = firefox;
    this.browserConsole = browserConsole;
    this.customPrefs = customPrefs;
    this.startUrl = startUrl;
  }

  getProfile(): Promise<FirefoxProfile> {
    const {firefoxApp, profilePath, customPrefs, keepProfileChanges} = this;
    return new Promise((resolve) => {
      if (profilePath) {
        if (keepProfileChanges) {
          log.debug(`Using Firefox profile from ${profilePath}`);
          resolve(firefoxApp.useProfile(profilePath, {customPrefs}));
        } else {
          log.debug(`Copying Firefox profile from ${profilePath}`);
          resolve(firefoxApp.copyProfile(profilePath, {customPrefs}));
        }
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

  run(profile: FirefoxProfile): Promise<FirefoxInfo> {
    const binaryArgs = [];
    const {firefoxApp, firefox, startUrl} = this;
    if (this.browserConsole) {
      binaryArgs.push('-jsconsole');
    }
    if (startUrl) {
      const urls = Array.isArray(startUrl) ? startUrl : [startUrl];
      for (const url of urls) {
        binaryArgs.push('--url', url);
      }
    }

    return firefoxApp.run(profile, {
      firefoxBinary: firefox, binaryArgs,
    });
  }
}

/* @flow */
import readline from 'readline';
import tty from 'tty';

import type Watchpack from 'watchpack';

import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import * as defaultFirefoxApp from '../firefox';
import {
  connectWithMaxRetries as defaultFirefoxClient,
} from '../firefox/remote';
import {createLogger} from '../util/logger';
import getValidatedManifest from '../util/manifest';
import defaultSourceWatcher from '../watcher';
import {
  createFileFilter as defaultFileFilterCreator,
} from '../util/file-filter';
import {
  MultipleTargetsExtensionRunner as defaultMultipleTargetsExtensionRunner,
  FirefoxDesktopExtensionRunner as defaultFirefoxDesktopExtensionRunner,
} from '../extension-runners';
// Import objects that are only used as Flow types.
import type {FirefoxPreferences} from '../firefox/preferences';
import type {OnSourceChangeFn} from '../watcher';
import type {
  IExtensionRunner, // eslint-disable-line import/named
} from '../extension-runners/base';
import type {FileFilterCreatorFn} from '../util/file-filter';

const log = createLogger(__filename);

// defaultWatcherCreator types and implementation.

export type WatcherCreatorParams = {|
  addonReload: (string) => Promise<void>,
  sourceDir: string,
  artifactsDir: string,
  onSourceChange?: OnSourceChangeFn,
  ignoreFiles?: Array<string>,
  createFileFilter?: FileFilterCreatorFn,
|};

export type WatcherCreatorFn = (params: WatcherCreatorParams) => Watchpack;

export function defaultWatcherCreator(
  {
    addonReload, sourceDir, artifactsDir, ignoreFiles,
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
    onChange: () => addonReload(sourceDir),
    shouldWatchFile: (file) => fileFilter.wantFile(file),
  });
}

export type ReloadParams = {|
  sourceDir?: string,
  extensionRunner: IExtensionRunner,
  desktopNotifications?: typeof defaultDesktopNotifications,
|};

export async function defaultAddonReload(
  {
    sourceDir, extensionRunner,
    desktopNotifications = defaultDesktopNotifications,
  }: ReloadParams
): Promise<void> {
  try {
    if (sourceDir) {
      log.debug(`Reloading add-on at ${sourceDir}`);
      await extensionRunner.reloadExtensionBySourceDir(sourceDir);
    } else {
      log.debug('Reloading all reloadable add-ons');
      await extensionRunner.reloadAllExtensions();
    }
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
  extensionRunner: IExtensionRunner,
  sourceDir: string,
  artifactsDir: string,
  ignoreFiles?: Array<string>,
|};

export type ReloadStrategyOptions = {|
  createWatcher?: WatcherCreatorFn,
  addonReload: typeof defaultAddonReload,
  stdin: stream$Readable,
|};

export function defaultReloadStrategy(
  {
    extensionRunner,
    sourceDir, artifactsDir, ignoreFiles,
  }: ReloadStrategyParams,
  {
    addonReload = defaultAddonReload,
    createWatcher = defaultWatcherCreator,
    stdin = process.stdin,
  }: ReloadStrategyOptions = {}
): void {
  const watcher: Watchpack = createWatcher({
    addonReload: async (watchedSourceDir) => {
      await addonReload({sourceDir: watchedSourceDir, extensionRunner});
    },
    sourceDir,
    artifactsDir,
    ignoreFiles,
  });

  extensionRunner.registerCleanup(() => {
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
        } else if (keyPressed.name === 'r') {
          log.debug('Reloading installed extensions on user request');
          await addonReload({extensionRunner});
        }
      }

      log.info('\nExiting web-ext on user request');
      extensionRunner.exit();
    });
  }
}


// Run command types and implementation.

export type CmdRunParams = {|
  sourceDir: string,
  artifactsDir: string,
  firefox: string,
  firefoxProfile?: string,
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
  shouldExitProgram?: boolean,
  FirefoxDesktopExtensionRunner?: typeof defaultFirefoxDesktopExtensionRunner,
  MultipleTargetsExtensionRunner?: typeof defaultMultipleTargetsExtensionRunner,
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
    FirefoxDesktopExtensionRunner = defaultFirefoxDesktopExtensionRunner,
    MultipleTargetsExtensionRunner = defaultMultipleTargetsExtensionRunner,
  }: CmdRunOptions = {}): Promise<Object> {

  log.info(`Running web extension from ${sourceDir}`);
  if (preInstall) {
    log.info('Disabled auto-reloading because it\'s not possible with ' +
             '--pre-install');
    noReload = true;
  }

  const manifestData = await getValidatedManifest(sourceDir);

  const commonRunnerParams = {
    extensions: [{sourceDir, manifestData}],
    keepProfileChanges,
    startUrl,
    noReload,
  };

  const firefoxDesktopRunnerParams = {
    // Firefox specific CLI options.
    firefoxBinary: firefox,
    profilePath: firefoxProfile,
    customPrefs,
    browserConsole,
    preInstall,

    // Firefox runner injected dependencies.
    firefoxApp,
    firefoxClient,
  };

  const firefoxDesktopRunner = new FirefoxDesktopExtensionRunner({
    ...commonRunnerParams,
    ...firefoxDesktopRunnerParams,
  });

  const runner = new MultipleTargetsExtensionRunner({
    runners: [firefoxDesktopRunner],
  });

  await runner.run();

  if (noReload) {
    log.info('Automatic extension reloading has been disabled');
  } else {
    log.info('The extension will reload if any source file changes');
    reloadStrategy({
      extensionRunner: runner,
      sourceDir,
      artifactsDir,
      ignoreFiles,
    });
  }

  return firefoxApp;
}

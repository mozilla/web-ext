/* @flow */

import readline from 'readline';

import type Watchpack from 'watchpack';

import type {
  IExtensionRunner, // eslint-disable-line import/named
  ExtensionRunnerReloadResult,
} from './base';
import {WebExtError} from '../errors';
import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import type {FirefoxAndroidExtensionRunnerParams} from './firefox-android';
import type {FirefoxDesktopExtensionRunnerParams} from './firefox-desktop';
import type {ChromiumExtensionRunnerParams} from './chromium';
import {createLogger} from '../util/logger';
import type {FileFilterCreatorFn} from '../util/file-filter';
import {
  createFileFilter as defaultFileFilterCreator,
} from '../util/file-filter';
import {
  isTTY, setRawMode,
} from '../util/stdin';
import defaultSourceWatcher from '../watcher';
import type {OnSourceChangeFn} from '../watcher';


const log = createLogger(__filename);

export type ExtensionRunnerConfig = {|
  target: 'firefox-desktop',
  params: FirefoxDesktopExtensionRunnerParams,
|} | {|
  target: 'firefox-android',
  params: FirefoxAndroidExtensionRunnerParams,
|} | {|
  target: 'chromium',
  params: ChromiumExtensionRunnerParams,
|};

export type MultiExtensionRunnerParams = {|
  runners: Array<IExtensionRunner>,
  desktopNotifications: typeof defaultDesktopNotifications,
|};

export async function createExtensionRunner(
  config: ExtensionRunnerConfig
): Promise<IExtensionRunner> {
  switch (config.target) {
    case 'firefox-desktop': {
      // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
      const {FirefoxDesktopExtensionRunner} = require('./firefox-desktop');
      return new FirefoxDesktopExtensionRunner(config.params);
    }
    case 'firefox-android': {
      // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
      const {FirefoxAndroidExtensionRunner} = require('./firefox-android');
      return new FirefoxAndroidExtensionRunner(config.params);
    }
    case 'chromium': {
      // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
      const {ChromiumExtensionRunner} = require('./chromium');
      return new ChromiumExtensionRunner(config.params);
    }
    default:
      throw new WebExtError(`Unknown target: "${config.target}"`);
  }
}

/**
 * Implements an IExtensionRunner which allow the caller to
 * manage multiple extension runners at the same time (e.g. by running
 * a Firefox Desktop instance alongside to a Firefox for Android instance).
 */
export class MultiExtensionRunner {
  extensionRunners: Array<IExtensionRunner>;
  desktopNotifications: typeof defaultDesktopNotifications;

  constructor(params: MultiExtensionRunnerParams) {
    this.extensionRunners = params.runners;
    this.desktopNotifications = params.desktopNotifications;
  }

  // Method exported from the IExtensionRunner interface.

  /**
   * Returns the runner name.
   */
  getName(): string {
    return 'Multi Extension Runner';
  }

  /**
   * Call the `run` method on all the managed extension runners,
   * and awaits that all the runners has been successfully started.
   */
  async run(): Promise<void> {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.run());
    }

    await Promise.all(promises);
  }

  /**
   * Reloads all the extensions on all the managed extension runners,
   * collect any reload error, and resolves to an array composed by
   * a ExtensionRunnerReloadResult object per managed runner.
   *
   * Any detected reload error is also logged on the terminal and shows as a
   * desktop notification.
   */
  async reloadAllExtensions(): Promise<Array<ExtensionRunnerReloadResult>> {
    log.debug('Reloading all reloadable add-ons');

    const promises = [];
    for (const runner of this.extensionRunners) {
      const reloadPromise = runner.reloadAllExtensions().then(
        () => {
          return {runnerName: runner.getName()};
        },
        (error) => {
          return {
            runnerName: runner.getName(),
            reloadError: error,
          };
        }
      );

      promises.push(reloadPromise);
    }

    return await Promise.all(promises).then((results) => {
      this.handleReloadResults(results);
      return results;
    });
  }

  /**
   * Reloads a single extension on all the managed extension runners,
   * collect any reload error and resolves to an array composed by
   * a ExtensionRunnerReloadResult object per managed runner.
   *
   * Any detected reload error is also logged on the terminal and shows as a
   * desktop notification.
   */
  async reloadExtensionBySourceDir(
    sourceDir: string
  ): Promise<Array<ExtensionRunnerReloadResult>> {
    log.debug(`Reloading add-on at ${sourceDir}`);

    const promises: Array<Promise<ExtensionRunnerReloadResult>> = [];
    for (const runner of this.extensionRunners) {
      const reloadPromise = runner.reloadExtensionBySourceDir(sourceDir).then(
        () => {
          return {runnerName: runner.getName(), sourceDir};
        },
        (error) => {
          return {
            runnerName: runner.getName(),
            reloadError: error,
            sourceDir,
          };
        }
      );

      promises.push(reloadPromise);
    }

    return await Promise.all(promises).then((results) => {
      this.handleReloadResults(results);
      return results;
    });
  }

  /**
   * Register a callback to be called when all the managed runners has been exited.
   */
  registerCleanup(cleanupCallback: Function): void {
    const promises = [];

    // Create a promise for every extension runner managed by this instance,
    // the promise will be resolved when the particular runner calls its
    // registered cleanup callbacks.
    for (const runner of this.extensionRunners) {
      promises.push(new Promise((resolve) => {
        runner.registerCleanup(resolve);
      }));
    }

    // Wait for all the created promises to be resolved or rejected
    // (once each one of the runners has cleaned up) and then call
    // the cleanup callback registered to this runner.
    Promise.all(promises).then(cleanupCallback, cleanupCallback);
  }

  /**
   * Exits all the managed runner has been exited.
   */
  async exit(): Promise<void> {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.exit());
    }

    await Promise.all(promises);
  }

  // Private helper methods.

  handleReloadResults(results: Array<ExtensionRunnerReloadResult>): void {
    for (const {runnerName, reloadError, sourceDir} of results) {
      if (reloadError instanceof Error) {
        let message = 'Error occurred while reloading';
        if (sourceDir) {
          message += ` "${sourceDir}" `;
        }

        message += `on "${runnerName}" - ${reloadError.message}`;

        log.error(`\n${message}`);
        log.debug(reloadError.stack);

        this.desktopNotifications({
          title: 'web-ext run: extension reload error',
          message,
        });
      }
    }
  }
}

// defaultWatcherCreator types and implementation.

export type WatcherCreatorParams = {|
  reloadExtension: (string) => void,
  sourceDir: string,
  watchFile?: Array<string>,
  watchIgnored?: Array<string>,
  artifactsDir: string,
  onSourceChange?: OnSourceChangeFn,
  ignoreFiles?: Array<string>,
  createFileFilter?: FileFilterCreatorFn,
|};

export type WatcherCreatorFn = (params: WatcherCreatorParams) => Watchpack;

export function defaultWatcherCreator(
  {
    reloadExtension, sourceDir, watchFile,
    watchIgnored, artifactsDir, ignoreFiles,
    onSourceChange = defaultSourceWatcher,
    createFileFilter = defaultFileFilterCreator,
  }: WatcherCreatorParams
): Watchpack {
  const fileFilter = createFileFilter(
    {sourceDir, artifactsDir, ignoreFiles}
  );
  return onSourceChange({
    sourceDir,
    watchFile,
    watchIgnored,
    artifactsDir,
    onChange: () => reloadExtension(sourceDir),
    shouldWatchFile: (file) => fileFilter.wantFile(file),
  });
}


// defaultReloadStrategy types and implementation.

export type ReloadStrategyParams = {|
  extensionRunner: IExtensionRunner,
  sourceDir: string,
  watchFile?: Array<string>,
  watchIgnored?: Array<string>,
  artifactsDir: string,
  ignoreFiles?: Array<string>,
  noInput?: boolean,
|};

export type ReloadStrategyOptions = {|
  createWatcher?: WatcherCreatorFn,
  stdin?: stream$Readable,
  kill?: (pid: number, signal?: string | number) => void,
|};

export function defaultReloadStrategy(
  {
    artifactsDir,
    extensionRunner,
    ignoreFiles,
    noInput = false,
    sourceDir,
    watchFile,
    watchIgnored,
  }: ReloadStrategyParams,
  {
    createWatcher = defaultWatcherCreator,
    stdin = process.stdin,
    // $FlowIgnore: ignore method-unbinding.
    kill = process.kill,
  }: ReloadStrategyOptions = {}
): void {
  const allowInput = !noInput;
  if (!allowInput) {
    log.debug('Input has been disabled because of noInput==true');
  }

  const watcher: Watchpack = createWatcher({
    reloadExtension: (watchedSourceDir) => {
      extensionRunner.reloadExtensionBySourceDir(watchedSourceDir);
    },
    sourceDir,
    watchFile,
    watchIgnored,
    artifactsDir,
    ignoreFiles,
  });

  extensionRunner.registerCleanup(() => {
    watcher.close();
    if (allowInput) {
      stdin.pause();
    }
  });

  if (allowInput && isTTY(stdin)) {
    readline.emitKeypressEvents(stdin);
    setRawMode(stdin, true);

    const keypressUsageInfo = 'Press R to reload (and Ctrl-C to quit)';

    // NOTE: this `Promise.resolve().then(...)` is basically used to spawn a "co-routine"
    // that is executed before the callback attached to the Promise returned by this function
    // (and it allows the `run` function to not be stuck in the while loop).
    Promise.resolve().then(async function() {
      log.info(keypressUsageInfo);

      let userExit = false;

      while (!userExit) {
        const keyPressed = await new Promise((resolve) => {
          stdin.once('keypress', (str, key) => resolve(key));
        });

        if (keyPressed.ctrl && keyPressed.name === 'c') {
          userExit = true;
        } else if (keyPressed.name === 'z') {
          // Prepare to suspend.

          // NOTE: Switch the raw mode off before suspending (needed to make the keypress event
          // to work correctly when the nodejs process is resumed).
          setRawMode(stdin, false);

          log.info('\nweb-ext has been suspended on user request');
          kill(process.pid, 'SIGTSTP');

          // Prepare to resume.

          log.info(`\nweb-ext has been resumed. ${keypressUsageInfo}`);

          // Switch the raw mode on on resume.
          setRawMode(stdin, true);
        } else if (keyPressed.name === 'r') {
          log.debug('Reloading installed extensions on user request');
          await extensionRunner.reloadAllExtensions().catch((err) => {
            log.warn(`\nError reloading extension: ${err}`);
            log.debug(`Reloading extension error stack: ${err.stack}`);
          });
        }
      }

      log.info('\nExiting web-ext on user request');
      extensionRunner.exit();
    });
  }
}

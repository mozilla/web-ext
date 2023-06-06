import readline from 'readline';

import { WebExtError } from '../errors.js';
import { createLogger } from '../util/logger.js';
import { createFileFilter as defaultFileFilterCreator } from '../util/file-filter.js';
import { isTTY, setRawMode } from '../util/stdin.js';
import defaultSourceWatcher from '../watcher.js';

const log = createLogger(import.meta.url);

export async function createExtensionRunner(config) {
  switch (config.target) {
    case 'firefox-desktop': {
      const { FirefoxDesktopExtensionRunner } = await import(
        './firefox-desktop.js'
      );
      return new FirefoxDesktopExtensionRunner(config.params);
    }
    case 'firefox-android': {
      const { FirefoxAndroidExtensionRunner } = await import(
        './firefox-android.js'
      );
      return new FirefoxAndroidExtensionRunner(config.params);
    }
    case 'chromium': {
      const { ChromiumExtensionRunner } = await import('./chromium.js');
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
  extensionRunners;
  desktopNotifications;

  constructor(params) {
    this.extensionRunners = params.runners;
    this.desktopNotifications = params.desktopNotifications;
  }

  // Method exported from the IExtensionRunner interface.

  /**
   * Returns the runner name.
   */
  getName() {
    return 'Multi Extension Runner';
  }

  /**
   * Call the `run` method on all the managed extension runners,
   * and awaits that all the runners has been successfully started.
   */
  async run() {
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
  async reloadAllExtensions() {
    log.debug('Reloading all reloadable add-ons');

    const promises = [];
    for (const runner of this.extensionRunners) {
      const reloadPromise = runner.reloadAllExtensions().then(
        () => {
          return { runnerName: runner.getName() };
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
  async reloadExtensionBySourceDir(sourceDir) {
    log.debug(`Reloading add-on at ${sourceDir}`);

    const promises = [];
    for (const runner of this.extensionRunners) {
      const reloadPromise = runner.reloadExtensionBySourceDir(sourceDir).then(
        () => {
          return { runnerName: runner.getName(), sourceDir };
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
  registerCleanup(cleanupCallback) {
    const promises = [];

    // Create a promise for every extension runner managed by this instance,
    // the promise will be resolved when the particular runner calls its
    // registered cleanup callbacks.
    for (const runner of this.extensionRunners) {
      promises.push(
        new Promise((resolve) => {
          runner.registerCleanup(resolve);
        })
      );
    }

    // Wait for all the created promises to be resolved or rejected
    // (once each one of the runners has cleaned up) and then call
    // the cleanup callback registered to this runner.
    Promise.all(promises).then(cleanupCallback, cleanupCallback);
  }

  /**
   * Exits all the managed runner has been exited.
   */
  async exit() {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.exit());
    }

    await Promise.all(promises);
  }

  // Private helper methods.

  handleReloadResults(results) {
    for (const { runnerName, reloadError, sourceDir } of results) {
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

export function defaultWatcherCreator({
  reloadExtension,
  sourceDir,
  watchFile,
  watchIgnored,
  artifactsDir,
  ignoreFiles,
  onSourceChange = defaultSourceWatcher,
  createFileFilter = defaultFileFilterCreator,
}) {
  const fileFilter = createFileFilter({ sourceDir, artifactsDir, ignoreFiles });
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

export function defaultReloadStrategy(
  {
    artifactsDir,
    extensionRunner,
    ignoreFiles,
    noInput = false,
    sourceDir,
    watchFile,
    watchIgnored,
  },
  {
    createWatcher = defaultWatcherCreator,
    stdin = process.stdin,
    kill = process.kill,
  } = {}
) {
  const allowInput = !noInput;
  if (!allowInput) {
    log.debug('Input has been disabled because of noInput==true');
  }

  const watcher = createWatcher({
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
    Promise.resolve().then(async function () {
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

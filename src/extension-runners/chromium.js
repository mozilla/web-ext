/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Chromium-based browser instance.
 */

import fs from 'fs/promises';
import path from 'path';

import {
  Launcher as ChromeLauncher,
  launch as defaultChromiumLaunch,
} from 'chrome-launcher';

import { createLogger } from '../util/logger.js';
import { TempDir } from '../util/temp-dir.js';
import isDirectory from '../util/is-directory.js';
import fileExists from '../util/file-exists.js';

const log = createLogger(import.meta.url);

const EXCLUDED_CHROME_FLAGS = [
  '--disable-extensions',
  '--mute-audio',
  '--disable-component-update',
];

export const DEFAULT_CHROME_FLAGS = ChromeLauncher.defaultFlags().filter(
  (flag) => !EXCLUDED_CHROME_FLAGS.includes(flag),
);

/**
 * Implements an IExtensionRunner which manages a Chromium instance.
 */
export class ChromiumExtensionRunner {
  cleanupCallbacks;
  params;
  chromiumInstance;
  chromiumLaunch;
  exiting;
  _promiseSetupDone;

  constructor(params) {
    const { chromiumLaunch = defaultChromiumLaunch } = params;
    this.params = params;
    this.chromiumLaunch = chromiumLaunch;
    this.cleanupCallbacks = new Set();
  }

  // Method exported from the IExtensionRunner interface.

  /**
   * Returns the runner name.
   */
  getName() {
    return 'Chromium';
  }

  async run() {
    // Run should never be called more than once.
    this._promiseSetupDone = this.setupInstance();
    await this._promiseSetupDone;
  }

  static async isUserDataDir(dirPath) {
    const localStatePath = path.join(dirPath, 'Local State');
    const defaultPath = path.join(dirPath, 'Default');
    // Local State and Default are typical for the user-data-dir
    return (
      (await fileExists(localStatePath)) && (await isDirectory(defaultPath))
    );
  }

  static async isProfileDir(dirPath) {
    const securePreferencesPath = path.join(dirPath, 'Secure Preferences');
    //Secure Preferences is typical for a profile dir inside a user data dir
    return await fileExists(securePreferencesPath);
  }

  static async getProfilePaths(chromiumProfile) {
    if (!chromiumProfile) {
      return {
        userDataDir: null,
        profileDirName: null,
      };
    }

    const isProfileDirAndNotUserData =
      (await ChromiumExtensionRunner.isProfileDir(chromiumProfile)) &&
      !(await ChromiumExtensionRunner.isUserDataDir(chromiumProfile));

    if (isProfileDirAndNotUserData) {
      const { dir: userDataDir, base: profileDirName } =
        path.parse(chromiumProfile);
      return {
        userDataDir,
        profileDirName,
      };
    }

    return {
      userDataDir: chromiumProfile,
      profileDirName: null,
    };
  }

  /**
   * Setup the Chromium Profile and run a Chromium instance.
   */
  async setupInstance() {
    // Start chrome pointing it to a given profile dir
    const extensions = this.params.extensions
      .map(({ sourceDir }) => sourceDir)
      .join(',');

    const { chromiumBinary } = this.params;

    log.debug('Starting Chromium instance...');

    if (chromiumBinary) {
      log.debug(`(chromiumBinary: ${chromiumBinary})`);
    }

    const chromeFlags = [...DEFAULT_CHROME_FLAGS];

    chromeFlags.push(`--load-extension=${extensions}`);

    if (this.params.args) {
      chromeFlags.push(...this.params.args);
    }

    // eslint-disable-next-line prefer-const
    let { userDataDir, profileDirName } =
      await ChromiumExtensionRunner.getProfilePaths(
        this.params.chromiumProfile,
      );

    if (userDataDir && this.params.keepProfileChanges) {
      if (
        profileDirName &&
        !(await ChromiumExtensionRunner.isUserDataDir(userDataDir))
      ) {
        throw new Error(
          'The profile you provided is not in a ' +
            'user-data-dir. The changes cannot be kept. Please either ' +
            'remove --keep-profile-changes or use a profile in a ' +
            'user-data-dir directory',
        );
      }
    } else if (!this.params.keepProfileChanges) {
      // the user provided an existing profile directory but doesn't want
      // the changes to be kept. we copy this directory to a temporary
      // user data dir.
      const tmpDir = new TempDir();
      await tmpDir.create();
      const tmpDirPath = tmpDir.path();

      if (userDataDir && profileDirName) {
        // copy profile dir to this temp user data dir.
        await fs.cp(
          path.join(userDataDir, profileDirName),
          path.join(tmpDirPath, profileDirName),
          { recursive: true },
        );
      } else if (userDataDir) {
        await fs.cp(userDataDir, tmpDirPath, { recursive: true });
      }
      userDataDir = tmpDirPath;
    }

    if (profileDirName) {
      chromeFlags.push(`--profile-directory=${profileDirName}`);
    }

    let startingUrl;
    if (this.params.startUrl) {
      const startingUrls = Array.isArray(this.params.startUrl)
        ? this.params.startUrl
        : [this.params.startUrl];
      startingUrl = startingUrls.shift();
      chromeFlags.push(...startingUrls);
    }

    this.chromiumInstance = await this.chromiumLaunch({
      chromePath: chromiumBinary,
      chromeFlags,
      startingUrl,
      userDataDir,
      logLevel: this.params.verbose ? 'verbose' : 'silent',
      // Ignore default flags to keep the extension enabled.
      ignoreDefaultFlags: true,
    });

    this.chromiumInstance.process.once('close', () => {
      this.chromiumInstance = null;

      if (!this.exiting) {
        log.info('Exiting on Chromium instance disconnected.');
        this.exit();
      }
    });
  }

  /**
   * Reloads all the extensions, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadAllExtensions() {
    const runnerName = this.getName();

    // TODO: Restore reload functionality using the remote debugging protocol.

    process.stdout.write(
      `\rLast extension reload: ${new Date().toTimeString()}`,
    );
    log.debug('\n');

    return [{ runnerName }];
  }

  /**
   * Reloads a single extension, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadExtensionBySourceDir(
    extensionSourceDir, // eslint-disable-line no-unused-vars
  ) {
    // TODO(rpl): detect the extension ids assigned to the
    // target extensions and map it to the extensions source dir
    // (https://github.com/mozilla/web-ext/issues/1687).
    return this.reloadAllExtensions();
  }

  /**
   * Register a callback to be called when the runner has been exited
   * (e.g. the Chromium instance exits or the user has requested web-ext
   * to exit).
   */
  registerCleanup(fn) {
    this.cleanupCallbacks.add(fn);
  }

  /**
   * Exits the runner, by closing the managed Chromium instance.
   */
  async exit() {
    this.exiting = true;

    // Wait for the setup to complete if the extension runner is already
    // being started.
    if (this._promiseSetupDone) {
      // Ignore initialization errors if any.
      await this._promiseSetupDone.catch((err) => {
        log.debug(`ignored setup error on chromium runner shutdown: ${err}`);
      });
    }

    if (this.chromiumInstance) {
      await this.chromiumInstance.kill();
      this.chromiumInstance = null;
    }

    // Call all the registered cleanup callbacks.
    for (const fn of this.cleanupCallbacks) {
      try {
        fn();
      } catch (error) {
        log.error(error);
      }
    }
  }
}

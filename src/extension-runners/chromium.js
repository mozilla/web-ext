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

// This is a client for the Chrome Devtools protocol. The methods and results
// are documented at https://chromedevtools.github.io/devtools-protocol/tot/
class ChromeDevtoolsProtocolClient {
  #receivedData = '';
  #isProcessingMessage = false;
  #lastId = 0;
  #deferredResponses = new Map();
  #disconnected = false;
  #disconnectedPromise;
  #resolveDisconnectedPromise;

  // Print all exchanged CDP messages to ease debugging.
  TEST_LOG_VERBOSE_CDP = process.env.TEST_LOG_VERBOSE_CDP;

  constructor(chromiumInstance) {
    // remoteDebuggingPipes is from chrome-launcher, see
    // https://github.com/GoogleChrome/chrome-launcher/pull/347
    const { incoming, outgoing } = chromiumInstance.remoteDebuggingPipes;
    this.#disconnectedPromise = new Promise((resolve) => {
      this.#resolveDisconnectedPromise = resolve;
    });
    if (incoming.closed) {
      // Strange. Did Chrome fail to start, or exit on startup?
      log.warn('CDP already disconnected at initialization');
      this.#finalizeDisconnect();
      return;
    }
    incoming.on('data', (data) => {
      this.#receivedData += data;
      this.#processNextMessage();
    });
    incoming.on('error', (error) => {
      log.error(error);
      this.#finalizeDisconnect();
    });
    incoming.on('close', () => this.#finalizeDisconnect());
    this.outgoingPipe = outgoing;
  }

  waitUntilDisconnected() {
    return this.#disconnectedPromise;
  }

  async sendCommand(method, params, sessionId = undefined) {
    if (this.#disconnected) {
      throw new Error(`CDP disconnected, cannot send: command ${method}`);
    }
    const message = {
      id: ++this.#lastId,
      method,
      params,
      sessionId,
    };
    const rawMessage = `${JSON.stringify(message)}\x00`;
    if (this.TEST_LOG_VERBOSE_CDP) {
      process.stderr.write(`[CDP] [SEND] ${rawMessage}\n`);
    }
    return new Promise((resolve, reject) => {
      // CDP will always send a response.
      this.#deferredResponses.set(message.id, { method, resolve, reject });
      this.outgoingPipe.write(rawMessage);
    });
  }

  #processNextMessage() {
    if (this.#isProcessingMessage) {
      return;
    }
    this.#isProcessingMessage = true;
    let end = this.#receivedData.indexOf('\x00');
    while (end !== -1) {
      const rawMessage = this.#receivedData.slice(0, end);
      this.#receivedData = this.#receivedData.slice(end + 1); // +1 skips \x00.
      try {
        if (this.TEST_LOG_VERBOSE_CDP) {
          process.stderr.write(`[CDP] [RECV] ${rawMessage}\n`);
        }
        const { id, error, result } = JSON.parse(rawMessage);
        const deferredResponse = this.#deferredResponses.get(id);
        if (deferredResponse) {
          this.#deferredResponses.delete(id);
          if (error) {
            const err = new Error(error.message || 'Unexpected CDP response');
            deferredResponse.reject(err);
          } else {
            deferredResponse.resolve(result);
          }
        } else {
          // Dropping events and non-response messages since we don't need it.
        }
      } catch (e) {
        log.error(e);
      }
      end = this.#receivedData.indexOf('\x00');
    }
    this.#isProcessingMessage = false;
    if (this.#disconnected) {
      for (const { method, reject } of this.#deferredResponses.values()) {
        reject(new Error(`CDP connection closed before response to ${method}`));
      }
      this.#deferredResponses.clear();
      this.#resolveDisconnectedPromise();
    }
  }

  #finalizeDisconnect() {
    if (!this.#disconnected) {
      this.#disconnected = true;
      this.#processNextMessage();
    }
  }
}

/**
 * Implements an IExtensionRunner which manages a Chromium instance.
 */
export class ChromiumExtensionRunner {
  cleanupCallbacks;
  params;
  chromiumInstance;
  chromiumLaunch;
  // --load-extension is deprecated, but only supported in Chrome 126+, see:
  // https://github.com/mozilla/web-ext/issues/3388#issuecomment-2906982117
  forceUseDeprecatedLoadExtension;
  exiting;
  _promiseSetupDone;

  constructor(params) {
    const { chromiumLaunch = defaultChromiumLaunch } = params;
    this.params = params;
    this.chromiumLaunch = chromiumLaunch;
    // We will try to use Extensions.loadUnpacked first (Chrome 126+), and if
    // that does not work fall back to --load-extension.
    this.forceUseDeprecatedLoadExtension = false;
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
    // NOTE: This function may be called twice, if the user is using an old
    // Chrome version (before Chrome 126), because then we have to add a
    // command-line flag (--load-extension) to load the extension. For details,
    // see:
    // https://github.com/mozilla/web-ext/issues/3388#issuecomment-2906982117

    // Start chrome pointing it to a given profile dir
    const extensions = this.params.extensions.map(({ sourceDir }) => sourceDir);

    const { chromiumBinary } = this.params;

    log.debug('Starting Chromium instance...');

    if (chromiumBinary) {
      log.debug(`(chromiumBinary: ${chromiumBinary})`);
    }

    const chromeFlags = [...DEFAULT_CHROME_FLAGS];
    chromeFlags.push('--remote-debugging-pipe');

    if (!this.forceUseDeprecatedLoadExtension) {
      chromeFlags.push('--enable-unsafe-extension-debugging');
    } else {
      chromeFlags.push(`--load-extension=${extensions.join(',')}`);
    }

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

    this.chromiumInstance = await this.chromiumLaunch({
      chromePath: chromiumBinary,
      chromeFlags,
      startingUrl,
      userDataDir,
      logLevel: this.params.verbose ? 'verbose' : 'silent',
      // Ignore default flags to keep the extension enabled.
      ignoreDefaultFlags: true,
    });
    this.cdp = new ChromeDevtoolsProtocolClient(this.chromiumInstance);

    const initialChromiumInstance = this.chromiumInstance;
    this.chromiumInstance.process.once('close', () => {
      if (this.chromiumInstance !== initialChromiumInstance) {
        // This happens when we restart Chrome to fall back to --load-extension.
        return;
      }
      this.chromiumInstance = null;

      if (!this.exiting) {
        log.info('Exiting on Chromium instance disconnected.');
        this.exit();
      }
    });

    if (!this.forceUseDeprecatedLoadExtension) {
      // Assume that the required Extensions.loadUnpacked CDP method is
      // supported. If it is not, we will fall back to --load-extension.
      let cdpSupportsExtensionsLoadUnpacked = true;
      for (const sourceDir of extensions) {
        try {
          await this.cdp.sendCommand('Extensions.loadUnpacked', {
            path: sourceDir,
          });
        } catch (e) {
          // Chrome 125- will emit the following message:
          if (e.message === "'Extensions.loadUnpacked' wasn't found") {
            cdpSupportsExtensionsLoadUnpacked = false;
            break;
          }
          log.error(`Failed to load extension at ${sourceDir}: ${e.message}`);
          // We do not have to throw - the extension can work again when
          // auto-reload is used. But users may like a hard fail, and this is
          // consistent with the firefox runner.
          throw e;
        }
      }
      if (!cdpSupportsExtensionsLoadUnpacked) {
        // Retry once, now with --load-extension.
        log.warn('Cannot load extension via CDP, falling back to old method');
        this.forceUseDeprecatedLoadExtension = true;
        this.chromiumInstance = null;
        await initialChromiumInstance.kill();
        await this.cdp.waitUntilDisconnected();
        this.cdp = null;
        return this.setupInstance();
      }
    }
  }

  /**
   * Reloads all the extensions, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadAllExtensions() {
    const runnerName = this.getName();

    if (this.forceUseDeprecatedLoadExtension) {
      this.reloadAllExtensionsFallbackForChrome125andEarlier();
    } else {
      for (const { sourceDir } of this.params.extensions) {
        try {
          await this.cdp.sendCommand('Extensions.loadUnpacked', {
            path: sourceDir,
          });
        } catch (e) {
          log.error(`Failed to load extension at ${sourceDir}: ${e.message}`);
        }
      }
    }

    process.stdout.write(
      `\rLast extension reload: ${new Date().toTimeString()}`,
    );
    log.debug('\n');

    return [{ runnerName }];
  }

  async reloadAllExtensionsFallbackForChrome125andEarlier() {
    // Ideally, we'd like to use the "Extensions.loadUnpacked" CDP command to
    // reload an extension, but that is unsupported in Chrome 125 and earlier.
    //
    // As a fallback, connect to chrome://extensions/ and reload from there.
    // Since we are targeting old Chrome versions, we can safely use the
    // chrome.developerPrivate APIs, because these are never going to change
    // for the old browser versions. Do NOT use this for newer versions!
    //
    // Target.* CDP methods documented at: https://chromedevtools.github.io/devtools-protocol/tot/Target/
    // developerPrivate documented at:
    // https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/extensions/api/developer_private.idl
    //
    // Specific revision that exposed developerPrivate to chrome://extensions/:
    // https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/extensions/api/developer_private.idl;drc=69bf75316e7ae533c0a0dccc1a56ca019aa95a1e
    // https://chromium.googlesource.com/chromium/src.git/+/69bf75316e7ae533c0a0dccc1a56ca019aa95a1e
    //
    // Specific revision that introduced developerPrivate.getExtensionsInfo:
    // https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/extensions/api/developer_private.idl;drc=69bf75316e7ae533c0a0dccc1a56ca019aa95a1e
    //
    // The above changes are from 2015; The --remote-debugging-pipe feature
    // that we rely on for CDP was added in 2018; this is the version of the
    // developerPrivate API at that time:
    // https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/extensions/api/developer_private.idl;drc=c9ae59c8f37d487f1f01c222deb6b7d1f51c99c2

    // Find an existing chrome://extensions/ tab, if it exists.
    let { targetInfos: targets } = await this.cdp.sendCommand(
      'Target.getTargets',
      { filter: [{ type: 'tab' }] },
    );
    targets = targets.filter((t) => t.url.startsWith('chrome://extensions/'));
    let targetId;
    const hasExistingTarget = targets.length > 0;
    if (hasExistingTarget) {
      targetId = targets[0].targetId;
    } else {
      const result = await this.cdp.sendCommand('Target.createTarget', {
        url: 'chrome://extensions/',
        newWindow: true,
        background: true,
        windowState: 'minimized',
      });
      targetId = result.targetId;
    }
    const codeToEvaluateInChrome = async () => {
      // This function is serialized and executed in Chrome. Designed for
      // compatibility with Chrome 69 - 125. Do not use JS syntax of functions
      // that are not supported in these versions!

      // eslint-disable-next-line no-undef
      const developerPrivate = chrome.developerPrivate;
      if (!developerPrivate || !developerPrivate.getExtensionsInfo) {
        // When chrome://extensions/ is still loading, its document URL may be
        // about:blank and the chrome.developerPrivate API is not exposed.
        return 'NOT_READY_PLEASE_RETRY';
      }
      const extensionIds = [];
      await new Promise((resolve) => {
        developerPrivate.getExtensionsInfo((extensions) => {
          for (const extension of extensions || []) {
            if (extension.location === 'UNPACKED') {
              // We only care about those loaded via --load-extension.
              extensionIds.push(extension.id);
            }
          }
          resolve();
        });
      });
      const reloadPromises = extensionIds.map((extensionId) => {
        return new Promise((resolve, reject) => {
          developerPrivate.reload(
            extensionId,
            // Suppress alert dialog when load fails.
            { failQuietly: true, populateErrorForUnpacked: true },
            (loadError) => {
              if (loadError) {
                reject(new Error(loadError.error));
              } else {
                resolve();
              }
            },
          );
        });
      });
      await Promise.all(reloadPromises);
      return reloadPromises.length;
    };
    try {
      const targetResult = await this.cdp.sendCommand('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      if (!targetResult.sessionId) {
        throw new Error('Unexpectedly, no sessionId from attachToTarget');
      }
      // In practice, we're going to run the logic only once. But if we are
      // unlucky, chrome://extensions is still loading, so we will then retry.
      for (let i = 0; i < 3; ++i) {
        const evalResult = await this.cdp.sendCommand(
          'Runtime.evaluate',
          {
            expression: `(${codeToEvaluateInChrome})();`,
            awaitPromise: true,
          },
          targetResult.sessionId,
        );
        const evalResultReturnValue = evalResult.result?.value;
        if (evalResultReturnValue === 'NOT_READY_PLEASE_RETRY') {
          await new Promise((r) => setTimeout(r, 200 * i));
          continue;
        }
        if (evalResult.exceptionDetails) {
          log.error(`Failed to reload: ${evalResult.exceptionDetails.text}`);
        }
        if (evalResultReturnValue !== this.params.extensions.length) {
          log.warn(`Failed to reload extensions: ${evalResultReturnValue}`);
        }
        break;
      }
    } finally {
      if (!hasExistingTarget && targetId) {
        try {
          await this.cdp.sendCommand('Target.closeTarget', { targetId });
        } catch (e) {
          log.error(e);
        }
      }
    }
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

    if (this.cdp) {
      await this.cdp.waitUntilDisconnected();
      this.cdp = null;
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

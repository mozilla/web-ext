/* @flow */

/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Chromium-based browser instance.
 */

import path from 'path';

import {fs} from 'mz';
import asyncMkdirp from 'mkdirp';
import {
  Launcher as ChromeLauncher,
  launch as defaultChromiumLaunch,
} from 'chrome-launcher';
import WebSocket from 'ws';

import {createLogger} from '../util/logger';
import {TempDir} from '../util/temp-dir';
import type {
  ExtensionRunnerParams,
  ExtensionRunnerReloadResult,
} from './base';

type ChromiumSpecificRunnerParams = {|
   chromiumBinary?: string,
   chromiumProfile?: string,
   chromiumLaunch?: typeof defaultChromiumLaunch,
|};

export type ChromiumExtensionRunnerParams = {|
  ...ExtensionRunnerParams,
  // Chromium desktop CLI params.
  ...ChromiumSpecificRunnerParams,
|};

const log = createLogger(__filename);

const EXCLUDED_CHROME_FLAGS = [
  '--disable-extensions',
  '--mute-audio',
];

export const DEFAULT_CHROME_FLAGS = ChromeLauncher.defaultFlags()
  .filter((flag) => !EXCLUDED_CHROME_FLAGS.includes(flag));

/**
 * Implements an IExtensionRunner which manages a Chromium instance.
 */
export class ChromiumExtensionRunner {
  cleanupCallbacks: Set<Function>;
  params: ChromiumExtensionRunnerParams;
  chromiumInstance: ChromeLauncher;
  chromiumLaunch: typeof defaultChromiumLaunch;
  reloadManagerExtension: string;
  wss: WebSocket.Server;
  exiting: boolean;
  _promiseSetupDone: ?Promise<void>;

  constructor(params: ChromiumExtensionRunnerParams) {
    const {
      chromiumLaunch = defaultChromiumLaunch,
    } = params;
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

  async run(): Promise<void> {
    // Run should never be called more than once.
    this._promiseSetupDone = this.setupInstance();
    await this._promiseSetupDone;
  }

  /**
   * Setup the Chromium Profile and run a Chromium instance.
   */
  async setupInstance(): Promise<void> {
    // Start a websocket server on a free localhost TCP port.
    this.wss = await new Promise((resolve) => {
      const server = new WebSocket.Server(
        {port: 0, host: 'localhost'},
        // Wait the server to be listening (so that the extension
        // runner can successfully retrieve server address and port).
        () => resolve(server));
    });

    // Prevent unhandled socket error (e.g. when chrome
    // is exiting, See https://github.com/websockets/ws/issues/1256).
    this.wss.on('connection', function(socket) {
      socket.on('error', (err) => {
        log.debug(`websocket connection error: ${err}`);
      });
    });

    // Create the extension that will manage the addon reloads
    this.reloadManagerExtension = await this.createReloadManagerExtension();

    // Start chrome pointing it to a given profile dir
    const extensions = [this.reloadManagerExtension].concat(
      this.params.extensions.map(({sourceDir}) => sourceDir)
    ).join(',');

    const {chromiumBinary} = this.params;

    log.debug('Starting Chromium instance...');

    if (chromiumBinary) {
      log.debug(`(chromiumBinary: ${chromiumBinary})`);
    }

    const chromeFlags = [...DEFAULT_CHROME_FLAGS];

    chromeFlags.push(`--load-extension=${extensions}`);

    if (this.params.args) {
      chromeFlags.push(...this.params.args);
    }

    if (this.params.chromiumProfile) {
      chromeFlags.push(`--user-data-dir=${this.params.chromiumProfile}`);
    }

    let startingUrl;
    if (this.params.startUrl) {
      const startingUrls = Array.isArray(this.params.startUrl) ?
        this.params.startUrl : [this.params.startUrl];
      startingUrl = startingUrls.shift();
      chromeFlags.push(...startingUrls);
    }

    this.chromiumInstance = await this.chromiumLaunch({
      enableExtensions: true,
      chromePath: chromiumBinary,
      chromeFlags,
      startingUrl,
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

  async wssBroadcast(data: Object) {
    return new Promise((resolve) => {
      const clients = this.wss ? new Set(this.wss.clients) : new Set();

      function cleanWebExtReloadComplete() {
        const client = this;
        client.removeEventListener('message', webExtReloadComplete);
        client.removeEventListener('close', cleanWebExtReloadComplete);
        clients.delete(client);
      }

      const webExtReloadComplete = async (message) => {
        const msg = JSON.parse(message.data);

        if (msg.type === 'webExtReloadExtensionComplete') {
          for (const client of clients) {
            cleanWebExtReloadComplete.call(client);
          }
          resolve();
        }
      };

      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.addEventListener('message', webExtReloadComplete);
          client.addEventListener('close', cleanWebExtReloadComplete);

          client.send(JSON.stringify(data));
        } else {
          clients.delete(client);
        }
      }

      if (clients.size === 0) {
        resolve();
      }
    });
  }

  async createReloadManagerExtension() {
    const tmpDir = new TempDir();
    await tmpDir.create();
    this.registerCleanup(() => tmpDir.remove());

    const extPath = path.join(
      tmpDir.path(),
      `reload-manager-extension-${Date.now()}`
    );

    log.debug(`Creating reload-manager-extension in ${extPath}`);

    await asyncMkdirp(extPath);

    await fs.writeFile(
      path.join(extPath, 'manifest.json'),
      JSON.stringify({
        manifest_version: 2,
        name: 'web-ext Reload Manager Extension',
        version: '1.0',
        permissions: ['management', 'tabs'],
        background: {
          scripts: ['bg.js'],
        },
      })
    );

    const wssInfo = this.wss.address();

    const bgPage = `(function bgPage() {
      async function getAllDevExtensions() {
        const allExtensions = await new Promise(
          r => chrome.management.getAll(r));

        return allExtensions.filter((extension) => {
          return extension.installType === "development" &&
            extension.id !== chrome.runtime.id;
        });
      }

      const setEnabled = (extensionId, value) =>
        chrome.runtime.id == extensionId ?
        new Promise.resolve() :
        new Promise(r => chrome.management.setEnabled(extensionId, value, r));

      async function reloadExtension(extensionId) {
        await setEnabled(extensionId, false);
        await setEnabled(extensionId, true);
      }

      const ws = new window.WebSocket(
        "ws://${wssInfo.address}:${wssInfo.port}");

      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'webExtReloadAllExtensions') {
          const devExtensions = await getAllDevExtensions();
          await Promise.all(devExtensions.map(ext => reloadExtension(ext.id)));
          ws.send(JSON.stringify({ type: 'webExtReloadExtensionComplete' }));
        }
      };
    })()`;

    await fs.writeFile(path.join(extPath, 'bg.js'), bgPage);
    return extPath;
  }

  /**
   * Reloads all the extensions, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadAllExtensions(): Promise<Array<ExtensionRunnerReloadResult>> {
    const runnerName = this.getName();

    await this.wssBroadcast({
      type: 'webExtReloadAllExtensions',
    });

    process.stdout.write(
      `\rLast extension reload: ${(new Date()).toTimeString()}`);
    log.debug('\n');

    return [{runnerName}];
  }

  /**
   * Reloads a single extension, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadExtensionBySourceDir(
    extensionSourceDir: string // eslint-disable-line no-unused-vars
  ): Promise<Array<ExtensionRunnerReloadResult>> {
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
  registerCleanup(fn: Function): void {
    this.cleanupCallbacks.add(fn);
  }

  /**
   * Exits the runner, by closing the managed Chromium instance.
   */
  async exit(): Promise<void> {
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

    if (this.wss) {
      await new Promise((resolve) => this.wss.close(resolve));
      this.wss = null;
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

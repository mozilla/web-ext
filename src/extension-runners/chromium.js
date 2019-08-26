/* @flow */

/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Chromium-based browser instance.
 */

import path from 'path';
import {promisify} from 'util';

import {fs} from 'mz';
import mkdirp from 'mkdirp';
import {
  LaunchedChrome,
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

const asyncMkdirp = promisify(mkdirp);

/**
 * Implements an IExtensionRunner which manages a Chromium instance.
 */
export class ChromiumExtensionRunner {
  cleanupCallbacks: Set<Function>;
  params: ChromiumExtensionRunnerParams;
  chromiumInstance: LaunchedChrome;
  chromiumLaunch: typeof defaultChromiumLaunch;
  reloadManagerExtension: string;
  wss: WebSocket.Server;
  exiting: boolean;

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

  /**
   * Setup the Chromium Profile and run a Chromium instance.
   */
  async run(): Promise<void> {
    // Start a websocket server on a free localhost TCP port.
    this.wss = new WebSocket.Server({
      port: 0,
      host: 'localhost',
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

    const chromeFlags = [`--load-extension=${extensions}`];

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
    });

    this.chromiumInstance.process.once('close', () => {
      this.chromiumInstance = null;

      if (!this.exiting) {
        log.info('Exiting on Chromium instance disconnected.');
        this.exit();
      }
    });
  }

  wssBroadcast(data: Object) {
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    }
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

    const bgPage = `(function bgPage(webExtParams) {
      async function getAllDevExtensions() {
        const [managerExtension, allExtensions] = await Promise.all([
          new Promise(r => chrome.management.getSelf(r)),
          new Promise(r => chrome.management.getAll(r)),
        ]);

        return allExtensions.filter((extension) => {
          return extension.installType === "development" &&
            extension.id !== managerExtension.id;
        });
      }

      const setEnabled = (extensionId, value) =>
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
          for (var ext of devExtensions) {
            reloadExtension(ext.id);
          }
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

    // TODO(rpl): file github issue to improve the chromium extension runner
    // to actually wait for the wssBroadcast to be processed by the connected
    // client (See https://github.com/mozilla/web-ext/pull/1392#discussion_r231535200).
    this.wssBroadcast({
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
    // TODO(rpl): file github issue to improve the manager extension
    // to make it able to detect the extension ids assigned to the
    // target extensions and map it to the extensions source dir.
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

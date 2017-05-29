/* @flow */
import defaultFirefoxConnector from 'node-firefox-connect';
// RemoteFirefox types and implementation
import type FirefoxClient from 'firefox-client'; //eslint-disable-line import/no-extraneous-dependencies

import {createLogger} from '../util/logger';
import {
  isErrorWithCode,
  RemoteTempInstallNotSupported,
  UsageError,
  WebExtError,
} from '../errors';

const log = createLogger(__filename);

// The default port that Firefox's remote debugger will listen on and the
// client will connect to.
export const REMOTE_PORT = 6005;

export type FirefoxConnectorFn =
  (port?: number) => Promise<FirefoxClient>;

export type FirefoxRDPAddonActor = {|
  id: string,
  actor: string,
|};

export type FirefoxRDPResponseError = {|
  error: {
    message: string,
  },
|};

export type FirefoxRDPResponseAddon = {|
  addon: FirefoxRDPAddonActor,
|};

export type FirefoxRDPResponseRequestTypes = {|
  requestTypes: Array<string>,
|};

// NOTE: this type aliases Object to catch any other possible response.
export type FirefoxRDPResponseAny = Object;

export type FirefoxRDPResponseMaybe =
  FirefoxRDPResponseRequestTypes | FirefoxRDPResponseAny;

export class RemoteFirefox {
  client: Object;
  checkedForAddonReloading: boolean;

  constructor(client: FirefoxClient) {
    this.client = client;
    this.checkedForAddonReloading = false;

    client.client.on('disconnect', () => {
      log.debug('Received "disconnect" from Firefox client');
    });
    client.client.on('end', () => {
      log.debug('Received "end" from Firefox client');
    });
    client.client.on('message', (info) => {
      // These are arbitrary messages that the client library ignores.
      log.debug(`Received message from client: ${JSON.stringify(info)}`);
    });
  }

  disconnect() {
    this.client.disconnect();
  }

  addonRequest(
    addon: FirefoxRDPAddonActor,
    request: string
  ): Promise<FirefoxRDPResponseMaybe> {
    return new Promise((resolve, reject) => {
      this.client.client.makeRequest(
        {to: addon.actor, type: request}, (response) => {
          if (response.error) {
            const error = `${response.error}: ${response.message}`;
            log.debug(
              `Client responded to '${request}' request with error:`, error);
            reject(new WebExtError(error));
          } else {
            resolve(response);
          }
        });
    });
  }

  installTemporaryAddon(
    addonPath: string
  ): Promise<FirefoxRDPResponseAddon> {
    return new Promise((resolve, reject) => {
      this.client.request('listTabs', (error, tabsResponse) => {
        if (error) {
          return reject(new WebExtError(
            `Remote Firefox: listTabs() error: ${error}`));
        }
        if (!tabsResponse.addonsActor) {
          log.debug(
            'listTabs returned a falsey addonsActor: ' +
            `${tabsResponse.addonsActor}`);
          return reject(new RemoteTempInstallNotSupported(
            'This is an older version of Firefox that does not provide an ' +
            'add-ons actor for remote installation. Try Firefox 49 or ' +
            'higher.'));
        }

        this.client.client.makeRequest({
          to: tabsResponse.addonsActor,
          type: 'installTemporaryAddon',
          addonPath,
        }, (installResponse) => {
          if (installResponse.error) {
            return reject(new WebExtError(
              'installTemporaryAddon: Error: ' +
              `${installResponse.error}: ${installResponse.message}`));
          }
          log.debug(
            `installTemporaryAddon: ${JSON.stringify(installResponse)}`);
          log.info(`Installed ${addonPath} as a temporary add-on`);
          resolve(installResponse);
        });
      });
    });
  }

  getInstalledAddon(addonId: string): Promise<FirefoxRDPAddonActor> {
    return new Promise(
      (resolve, reject) => {
        this.client.request('listAddons', (error, response) => {
          if (error) {
            reject(new WebExtError(
              `Remote Firefox: listAddons() error: ${error}`));
          } else {
            resolve(response.addons);
          }
        });
      })
      .then((addons) => {
        for (const addon of addons) {
          if (addon.id === addonId) {
            return addon;
          }
        }
        log.debug(
          `Remote Firefox has these addons: ${addons.map((a) => a.id)}`);
        throw new WebExtError(
          'The remote Firefox does not have your extension installed');
      });
  }

  async checkForAddonReloading(
    addon: FirefoxRDPAddonActor
  ): Promise<FirefoxRDPAddonActor> {
    if (this.checkedForAddonReloading) {
      // We only need to check once if reload() is supported.
      return addon;
    } else {
      const response = await this.addonRequest(addon, 'requestTypes');

      if (response.requestTypes.indexOf('reload') === -1) {
        const supportedRequestTypes = JSON.stringify(response.requestTypes);
        log.debug(
          `Remote Firefox only supports: ${supportedRequestTypes}`);
        throw new UsageError(
          'This Firefox version does not support add-on reloading. ' +
          'Re-run with --no-reload');
      } else {
        this.checkedForAddonReloading = true;
        return addon;
      }
    }
  }

  async reloadAddon(addonId: string): Promise<void> {
    const addon = await this.getInstalledAddon(addonId);
    await this.checkForAddonReloading(addon);
    await this.addonRequest(addon, 'reload');
    process.stdout.write(
      `\rLast extension reload: ${(new Date()).toTimeString()}`);
    log.debug('\n');
  }
}


// Connect types and implementation

export type ConnectOptions = {|
  connectToFirefox: FirefoxConnectorFn,
|};

export async function connect(
  port: number = REMOTE_PORT,
  {connectToFirefox = defaultFirefoxConnector}: ConnectOptions = {}
): Promise<RemoteFirefox> {
  log.debug(`Connecting to Firefox on port ${port}`);
  const client = await connectToFirefox(port);
  log.debug(`Connected to the remote Firefox debugger on port ${port}`);
  return new RemoteFirefox(client);
}


// ConnectWithMaxRetries types and implementation

export type ConnectWithMaxRetriesParams = {|
  maxRetries?: number,
  retryInterval?: number,
  port: number,
|};

export type ConnectWithMaxRetriesDeps = {|
  connectToFirefox: typeof connect,
|};

export async function connectWithMaxRetries(
  // A max of 250 will try connecting for 30 seconds.
  {maxRetries = 250, retryInterval = 120, port}: ConnectWithMaxRetriesParams,
  {connectToFirefox = connect}: ConnectWithMaxRetriesDeps = {}
): Promise<RemoteFirefox> {
  async function establishConnection() {
    var lastError;

    for (let retries = 0; retries <= maxRetries; retries++) {
      try {
        return await connectToFirefox(port);
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

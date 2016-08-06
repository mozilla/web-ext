/* @flow */
import {createLogger} from '../util/logger';
import {RemoteTempInstallNotSupported, WebExtError} from '../errors';
import defaultFirefoxConnector from 'node-firefox-connect';

const log = createLogger(__filename);


// Flow Types

import type FirefoxClient from 'firefox-client';

export type FirefoxConnectorFn =
  (port: number) => Promise<FirefoxClient>;

export type ConnectExtraParams = {
  connectToFirefox: FirefoxConnectorFn,
};

export type FirefoxRDPAddonActor = {
  id: string,
  actor: string,
};

export type FirefoxRDPResponseError = {
  error: {
    message: string,
  },
};

export type FirefoxRDPResponseAny = Object;

export type FirefoxRDPResponseAddon = {
  addon: FirefoxRDPAddonActor,
};

export type FirefoxRDPResponseMaybe =
  FirefoxRDPResponseError | FirefoxRDPResponseAddon | FirefoxRDPResponseAny;

export type DefaultFirefoxConnectorFn =
  (port: number, extraParams?: ConnectExtraParams) => Promise<RemoteFirefox>;

// Exports

// The default port that Firefox's remote debugger will listen on and the
// client will connect to.
export const REMOTE_PORT = 6005;


export default function connect(
  port: number = REMOTE_PORT,
  {connectToFirefox=defaultFirefoxConnector}: ConnectExtraParams = {}
): Promise<RemoteFirefox> {
  log.debug(`Connecting to Firefox on port ${port}`);
  return connectToFirefox(port)
    .then((client) => {
      log.debug('Connected to the remote Firefox debugger');
      return new RemoteFirefox(client);
    });
}


export class RemoteFirefox {
  client: Object;
  checkForAddonReloading: Function;
  checkedForAddonReloading: boolean;
  addonRequest: Function;
  getInstalledAddon: Function;

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
            reject(
              new WebExtError(`${request} response error: ` +
                              `${response.error}: ${response.message}`));
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
      this.client.request('listTabs', (error, response) => {
        if (error) {
          return reject(new WebExtError(
            `Remote Firefox: listTabs() error: ${error}`));
        }
        if (!response.addonsActor) {
          log.debug(
            `listTabs returned a falsey addonsActor: ${response.addonsActor}`);
          return reject(new RemoteTempInstallNotSupported(
            'This is an older version of Firefox that does not provide an ' +
            'add-ons actor for remote installation. Try Firefox 49 or ' +
            'higher.'));
        }
        this.client.client.makeRequest(
          {to: response.addonsActor, type: 'installTemporaryAddon', addonPath},
          (response) => {
            if (response.error) {
              return reject(new WebExtError(
                'installTemporaryAddon: Error: ' +
                `${response.error}: ${response.message}`));
            }
            log.debug(`installTemporaryAddon: ${JSON.stringify(response)}`);
            log.info(`Installed ${addonPath} as a temporary add-on`);
            resolve(response);
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

  checkForAddonReloading(
    addon: FirefoxRDPAddonActor
  ): Promise<FirefoxRDPAddonActor> {
    if (this.checkedForAddonReloading) {
      // We only need to check once if reload() is supported.
      return Promise.resolve(addon);
    } else {
      return this.addonRequest(addon, 'requestTypes')
        .then((response) => {
          if (response.requestTypes.indexOf('reload') === -1) {
            log.debug(
              `Remote Firefox only supports: ${response.requestTypes}`);
            throw new WebExtError(
              'This Firefox version does not support add-on reloading. ' +
              'Re-run with --no-reload');
          } else {
            this.checkedForAddonReloading = true;
            return addon;
          }
        });
    }
  }

  reloadAddon(addonId: string): Promise<FirefoxRDPResponseMaybe> {
    return this.getInstalledAddon(addonId)
      .then((addon) => this.checkForAddonReloading(addon))
      .then((addon) => {
        log.info(
          `${(new Date()).toTimeString()}: Reloaded extension: ${addon.id}`);
        return this.addonRequest(addon, 'reload');
      });
  }
}

// NOTE: this fix an issue with flow and default exports (which currently
// lose their type signatures) by explicitly declare the default export
// signature. Reference: https://github.com/facebook/flow/issues/449
declare function exports( // eslint-disable-line no-unused-vars
  port: number, extraParams?: ConnectExtraParams
): Promise<RemoteFirefox>;

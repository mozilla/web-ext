/* @flow */
import {createLogger} from '../util/logger';
import {WebExtError} from '../errors';
import defaultFirefoxConnector from 'node-firefox-connect';

const log = createLogger(__filename);


export default function connect(
    port: number = 6000,
    {connectToFirefox=defaultFirefoxConnector}: Object = {}): Promise {
  return connectToFirefox(port)
    .then((client) => {
      log.info('Connected to the Firefox remote debugger');
      return new RemoteFirefox(client);
    });
}


export class RemoteFirefox {
  client: Object;
  checkForAddonReloading: Function;
  checkedForAddonReloading: boolean;
  addonRequest: Function;
  getInstalledAddon: Function;

  constructor(client: Object) {
    this.client = client;
    this.checkedForAddonReloading = false;
  }

  disconnect() {
    this.client.disconnect();
  }

  addonRequest(addon: Object, request: string): Promise {
    return new Promise((resolve, reject) => {
      this.client.client.makeRequest(
          {to: addon.actor, type: request}, (response) => {
        if (response.error) {
          reject(
            new WebExtError(`${request} response error: ${response.error}`));
        } else {
          resolve(response);
        }
      });
    });
  }

  getInstalledAddon(addonId: string): Promise {
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

  checkForAddonReloading(addon: Object): Promise {
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
              'This Firefox version does not support addon.reload() yet');
          } else {
            this.checkedForAddonReloading = true;
            return addon;
          }
        });
    }
  }

  reloadAddon(addonId: string): Promise {
    return this.getInstalledAddon(addonId)
      .then((addon) => this.checkForAddonReloading(addon))
      .then((addon) => {
        log.info(
          `${(new Date()).toTimeString()}: Reloaded extension: ${addon.id}`);
        return this.addonRequest(addon, 'reload');
      });
  }
}

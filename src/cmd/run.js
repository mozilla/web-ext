/* @flow */
import * as defaultFirefox from '../firefox';
import defaultFirefoxConnector from '../firefox/remote';
import {onlyErrorsWithCode} from '../errors';
import {createLogger} from '../util/logger';
import getValidatedManifest from '../util/manifest';
import defaultSourceWatcher from '../watcher';

const log = createLogger(__filename);


export function defaultWatcherCreator(
    {client, sourceDir, artifactsDir, createRunner,
     onSourceChange=defaultSourceWatcher}: Object): Object {
  return onSourceChange({
    sourceDir, artifactsDir, onChange: () => {
      return createRunner()
        .then((runner) => {
          log.debug('Attempting to reload extension');
          const addonId = runner.manifestData.applications.gecko.id;
          log.debug(`Reloading add-on ID ${addonId}`);
          return client.reloadAddon(addonId);
        })
        .catch((error) => {
          log.error(error.stack);
          throw error;
        });
    },
  });
}


export function defaultReloadStrategy(
    {firefox, client, profile, sourceDir, artifactsDir, createRunner}: Object,
    {createWatcher=defaultWatcherCreator}: Object = {}) {
  let watcher;

  firefox.on('close', () => {
    client.disconnect();
    watcher.close();
  });

  watcher = createWatcher({
    client, sourceDir, artifactsDir, createRunner,
  });
}


export function defaultFirefoxClient(
    {connectToFirefox=defaultFirefoxConnector,
     maxRetries=25, retryInterval=120}: Object = {}) {
  var retries = 0;

  function establishConnection() {
    return new Promise((resolve, reject) => {
      connectToFirefox()
        .then((connectedClient) => {
          log.debug('Connected to the Firefox debugger');
          resolve(connectedClient);
        })
        .catch(onlyErrorsWithCode('ECONNREFUSED', (error) => {
          if (retries >= maxRetries) {
            log.debug('Connect to Firefox debugger: too many retries');
            throw error;
          } else {
            setTimeout(() => {
              retries ++;
              log.debug(
                `Retrying Firefox (${retries}); connection error: ${error}`);
              resolve(establishConnection());
            }, retryInterval);
          }
        }))
        .catch((error) => {
          log.error(error.stack);
          reject(error);
        });
    });
  }

  return establishConnection();
}


export default function run(
    {sourceDir, artifactsDir, firefoxBinary, firefoxProfile, noReload}: Object,
    {firefoxClient=defaultFirefoxClient, firefox=defaultFirefox,
     reloadStrategy=defaultReloadStrategy}
    : Object = {}): Promise {

  log.info(`Running web extension from ${sourceDir}`);

  function createRunner() {
    return getValidatedManifest(sourceDir)
      .then((manifestData) => {
        return new ExtensionRunner({
          sourceDir,
          firefox,
          firefoxBinary,
          manifestData,
          firefoxProfile,
        });
      });
  }

  return createRunner()
    .then((runner) => {
      return runner.getProfile().then((profile) => {
        return {runner, profile};
      });
    })
    .then(({runner, profile}) => {
      return runner.run(profile).then((firefox) => {
        return {runner, profile, firefox};
      });
    })
    .then((config) => {
      return firefoxClient().then((client) => {
        return {client, ...config};
      });
    })
    .then((config) => {
      const {runner, client} = config;
      return runner.install(client).then(() => {
        return config;
      });
    })
    .then(({firefox, profile, client}) => {
      if (noReload) {
        log.debug('Extension auto-reloading has been disabled');
      } else {
        log.debug('Reloading extension when the source changes');
        reloadStrategy({firefox, profile, client, sourceDir,
                        artifactsDir, createRunner});
      }
      return firefox;
    });
}


export class ExtensionRunner {
  sourceDir: string;
  manifestData: Object;
  firefoxProfile: Object;
  firefox: Object;
  firefoxBinary: string;

  constructor({firefox, sourceDir, manifestData,
               firefoxProfile, firefoxBinary}: Object) {
    this.sourceDir = sourceDir;
    this.manifestData = manifestData;
    this.firefoxProfile = firefoxProfile;
    this.firefox = firefox;
    this.firefoxBinary = firefoxBinary;
  }

  getProfile(): Promise {
    const {firefox, firefoxProfile} = this;
    return new Promise((resolve) => {
      if (firefoxProfile) {
        log.debug(`Copying Firefox profile from ${firefoxProfile}`);
        resolve(firefox.copyProfile(firefoxProfile));
      } else {
        log.debug('Creating new Firefox profile');
        resolve(firefox.createProfile());
      }
    });
  }

  install(client: Object): Promise {
    return client.installTemporaryAddon(this.sourceDir);
  }

  run(profile: Object): Promise {
    const {firefox, firefoxBinary} = this;
    return firefox.run(profile, {firefoxBinary});
  }
}

/* @flow */
import buildExtension from './build';
import * as defaultFirefox from '../firefox';
import defaultFirefoxConnector from '../firefox/remote';
import {onlyErrorsWithCode} from '../errors';
import {withTempDir} from '../util/temp-dir';
import {createLogger} from '../util/logger';
import getValidatedManifest from '../util/manifest';
import defaultSourceWatcher from '../watcher';

const log = createLogger(__filename);


export function defaultWatcherCreator(
    {profile, client, sourceDir, artifactsDir, createRunner,
     onSourceChange=defaultSourceWatcher}: Object): Object {
  return onSourceChange({
    sourceDir, artifactsDir, onChange: () => createRunner(
      (runner) => runner.buildExtension()
        .then((buildResult) => runner.install(buildResult, {profile}))
        .then(() => {
          log.debug('Attempting to reload extension');
          const addonId = runner.manifestData.applications.gecko.id;
          log.debug(`Reloading add-on ID ${addonId}`);
          return client.reloadAddon(addonId);
        })
        .catch((error) => {
          log.error(error.stack);
          throw error;
        })
    ),
  });
}


export function defaultReloadStrategy(
    {firefox, profile, sourceDir, artifactsDir, createRunner}: Object,
    {connectToFirefox=defaultFirefoxConnector,
     maxRetries=25, retryInterval=120,
     createWatcher=defaultWatcherCreator}: Object = {}): Promise {
  var watcher;
  var client;
  var retries = 0;

  firefox.on('close', () => {
    if (client) {
      client.disconnect();
    }
    if (watcher) {
      watcher.close();
    }
  });

  function establishConnection() {
    return new Promise((resolve, reject) => {
      connectToFirefox()
        .then((connectedClient) => {
          log.debug('Connected to the Firefox debugger');
          client = connectedClient;
          watcher = createWatcher({
            profile, client, sourceDir, artifactsDir, createRunner,
          });
          resolve();
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
    {firefox=defaultFirefox, reloadStrategy=defaultReloadStrategy}
    : Object = {}): Promise {

  log.info(`Running web extension from ${sourceDir}`);

  function createRunner(callback) {
    return getValidatedManifest(sourceDir)
      .then((manifestData) => withTempDir(
        (tmpDir) => {
          const runner = new ExtensionRunner({
            sourceDir,
            firefox,
            firefoxBinary,
            tmpDirPath: tmpDir.path(),
            manifestData,
            firefoxProfile,
          });
          return callback(runner);
        }
      ));
  }

  return createRunner(
    (runner) => runner.buildExtension()
      .then((buildResult) => runner.install(buildResult))
      .then((profile) => runner.run(profile).then((firefox) => {
        return {firefox, profile};
      }))
      .then(({firefox, profile}) => {
        if (noReload) {
          log.debug('Extension auto-reloading has been disabled');
        } else {
          log.debug('Reloading extension when the source changes');
          reloadStrategy(
            {firefox, profile, sourceDir, artifactsDir, createRunner});
        }
        return firefox;
      })
  );
}


export class ExtensionRunner {
  sourceDir: string;
  tmpDirPath: string;
  manifestData: Object;
  firefoxProfile: Object;
  firefox: Object;
  firefoxBinary: string;

  constructor({firefox, sourceDir, tmpDirPath, manifestData,
               firefoxProfile, firefoxBinary}: Object) {
    this.sourceDir = sourceDir;
    this.tmpDirPath = tmpDirPath;
    this.manifestData = manifestData;
    this.firefoxProfile = firefoxProfile;
    this.firefox = firefox;
    this.firefoxBinary = firefoxBinary;
  }

  buildExtension(): Promise {
    const {sourceDir, tmpDirPath, manifestData} = this;
    return buildExtension({sourceDir, artifactsDir: tmpDirPath},
                          {manifestData});
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

  install(buildResult: Object, {profile}: Object = {}): Promise {
    const {firefox, manifestData} = this;
    return Promise.resolve(profile ? profile : this.getProfile())
      .then((profile) => firefox.installExtension(
        {
          manifestData,
          extensionPath: buildResult.extensionPath,
          profile,
        })
        .then(() => profile));
  }

  run(profile: Object): Promise {
    const {firefox, firefoxBinary} = this;
    return firefox.run(profile, {firefoxBinary});
  }
}

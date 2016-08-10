/* @flow */
import * as defaultFirefox from '../firefox';
import defaultFirefoxConnector from '../firefox/remote';
import {
  onlyInstancesOf, onlyErrorsWithCode, RemoteTempInstallNotSupported,
  WebExtError,
} from '../errors';
import {createLogger} from '../util/logger';
import getValidatedManifest, {getManifestId} from '../util/manifest';
import defaultSourceWatcher from '../watcher';

const log = createLogger(__filename);

// Flow types

// Import objects that are only used as Flow types.
import type FirefoxProfile from 'firefox-profile';
import type {OnSourceChangeFn} from '../watcher';
import type Watchpack from 'watchpack';
import type {
  FirefoxProcess,
} from '../firefox/index';
import type {
  FirefoxConnectorFn, RemoteFirefox,
  FirefoxRDPResponseAddon,
} from '../firefox/remote';
import type {ExtensionManifest} from '../util/manifest';

export type WatcherCreatorParams = {
  addonId: string,
  client: RemoteFirefox,
  sourceDir: string,
  artifactsDir: string,
  onSourceChange?: OnSourceChangeFn,
};

export type ReloadStrategyParams = {
  addonId: string,
  firefox: FirefoxProcess,
  client: RemoteFirefox,
  profile: FirefoxProfile,
  sourceDir: string,
  artifactsDir: string,
};

export type WatcherCreatorFn = (params: WatcherCreatorParams) => Watchpack;

export type ReloadStrategyOptions = {
  createWatcher?: WatcherCreatorFn,
};

export type CreateFirefoxClientParams = {
  connectToFirefox?: FirefoxConnectorFn,
  maxRetries: number,
  retryInterval: number,
};

// Module internals & exports

export function defaultWatcherCreator(
  {
    addonId, client, sourceDir, artifactsDir,
    onSourceChange=defaultSourceWatcher,
  }: WatcherCreatorParams
 ): Watchpack {
  return onSourceChange({
    sourceDir, artifactsDir, onChange: () => {
      log.debug(`Reloading add-on ID ${addonId}`);
      return client.reloadAddon(addonId)
        .catch((error) => {
          log.error(error.stack);
          throw error;
        });
    },
  });
}


export function defaultReloadStrategy(
  {
    addonId, firefox, client, profile, sourceDir, artifactsDir,
  }: ReloadStrategyParams,
  {
    createWatcher=defaultWatcherCreator,
  }: ReloadStrategyOptions = {}
): void {
  let watcher: Watchpack;

  firefox.on('close', () => {
    client.disconnect();
    watcher.close();
  });

  watcher = createWatcher({addonId, client, sourceDir, artifactsDir});
}


export function defaultFirefoxClient(
  {
    connectToFirefox=defaultFirefoxConnector,
    // A max of 250 will try connecting for 30 seconds.
    maxRetries=250, retryInterval=120,
  }: CreateFirefoxClientParams = {}
): Promise<RemoteFirefox> {
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

  log.info('Connecting to the remote Firefox debugger');
  return establishConnection();
}

export type CmdRunParams = {
  sourceDir: string,
  artifactsDir: string,
  firefoxBinary: string,
  firefoxProfile: string,
  preInstall: boolean,
  noReload: boolean,
};

export type CmdRunOptions = {
  firefox: typeof defaultFirefox,
  firefoxClient: typeof defaultFirefoxClient,
  reloadStrategy: typeof defaultReloadStrategy,
};

export default function run(
  {
    sourceDir, artifactsDir, firefoxBinary, firefoxProfile,
    preInstall=false, noReload=false,
  }: CmdRunParams,
  {
    firefox=defaultFirefox,
    firefoxClient=defaultFirefoxClient,
    reloadStrategy=defaultReloadStrategy,
  }: CmdRunOptions = {}): Promise<Object> {

  log.info(`Running web extension from ${sourceDir}`);
  if (preInstall) {
    log.info('Disabled auto-reloading because it\'s not possible with ' +
             '--pre-install');
    noReload = true;
  }
  // When not pre-installing the extension, we require a remote
  // connection to Firefox.
  const requiresRemote = !preInstall;
  let installed = false;

  return getValidatedManifest(sourceDir)
    .then((manifestData) => {
      return new ExtensionRunner({
        sourceDir,
        firefox,
        firefoxBinary,
        manifestData,
        profilePath: firefoxProfile,
      });
    })
    .then((runner: ExtensionRunner) => {
      return runner.getProfile().then((profile: FirefoxProfile) => {
        return {runner, profile};
      });
    })
    .then((config) => {
      const runner: ExtensionRunner = config.runner;
      const profile: FirefoxProfile = config.profile;
      return new Promise(
        (resolve) => {
          if (!preInstall) {
            log.debug('Deferring extension installation until after ' +
                      'connecting to the remote debugger');
            resolve(config);
          } else {
            log.debug('Pre-installing extension as a proxy file');
            resolve(runner.installAsProxy(profile).then((addonId) => {
              installed = true;
              return {addonId, ...config};
            }));
          }
        });
    })
    .then((config) => {
      const runner: ExtensionRunner = config.runner;
      const profile: FirefoxProfile = config.profile;
      return runner.run(profile).then((firefox) => {
        return {firefox, ...config};
      });
    })
    .then((config) => {
      if (requiresRemote) {
        return firefoxClient().then((client) => {
          return {client, ...config};
        });
      } else {
        return config;
      }
    })
    .then((config) => {
      if (installed) {
        log.debug('Not installing as temporary add-on because the ' +
                  'add-on was already installed');
        return config;
      } else {
        const runner: ExtensionRunner = config.runner;
        const client: RemoteFirefox = config.client;
        return runner.installAsTemporaryAddon(client)
          .then((installResult: FirefoxRDPResponseAddon) => {
            return {addonId: installResult.addon.id, ...config};
          });
      }
    })
    .catch(onlyInstancesOf(RemoteTempInstallNotSupported, (error) => {
      log.debug(`Caught: ${error}`);
      throw new WebExtError(
        'Temporary add-on installation is not supported in this version ' +
        'of Firefox (you need Firefox 49 or higher). For older Firefox ' +
        'versions, use --pre-install');
    }))
    .then((config) => {
      const firefox: FirefoxProcess = config.firefox;
      const profile: FirefoxProfile = config.profile;
      const client: RemoteFirefox = config.firefox;
      const addonId: string = config.addonId;

      if (noReload) {
        log.debug('Extension auto-reloading has been disabled');
      } else {
        log.debug(
          `Reloading extension when the source changes; id=${addonId}`);
        reloadStrategy({
          firefox, profile, client, sourceDir, artifactsDir, addonId,
        });
      }
      return firefox;
    });
}


export type ExtensionRunnerParams = {
  sourceDir: string,
  manifestData: ExtensionManifest,
  profilePath: string,
  firefox: typeof defaultFirefox,
  firefoxBinary: string,
};

export class ExtensionRunner {
  sourceDir: string;
  manifestData: ExtensionManifest;
  profilePath: string;
  firefox: typeof defaultFirefox;
  firefoxBinary: string;

  constructor(
    {
      firefox, sourceDir, manifestData,
      profilePath, firefoxBinary,
    }: ExtensionRunnerParams
  ) {
    this.sourceDir = sourceDir;
    this.manifestData = manifestData;
    this.profilePath = profilePath;
    this.firefox = firefox;
    this.firefoxBinary = firefoxBinary;
  }

  getProfile(): Promise<FirefoxProfile> {
    const {firefox, profilePath} = this;
    return new Promise((resolve) => {
      if (profilePath) {
        log.debug(`Copying Firefox profile from ${profilePath}`);
        resolve(firefox.copyProfile(profilePath));
      } else {
        log.debug('Creating new Firefox profile');
        resolve(firefox.createProfile());
      }
    });
  }

  installAsTemporaryAddon(
    client: RemoteFirefox
  ): Promise<FirefoxRDPResponseAddon> {
    return client.installTemporaryAddon(this.sourceDir);
  }

  installAsProxy(profile: Object): Promise<string|void> {
    const {firefox, sourceDir, manifestData} = this;
    return firefox.installExtension(
      {
        manifestData,
        asProxy: true,
        extensionPath: sourceDir,
        profile,
      })
      .then(() => getManifestId(manifestData));
  }

  run(profile: Object): Promise<FirefoxProcess> {
    const {firefox, firefoxBinary} = this;
    return firefox.run(profile, {firefoxBinary});
  }
}

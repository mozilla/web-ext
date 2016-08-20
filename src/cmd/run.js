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


// defaultWatcherCreator types and implementation.

export type WatcherCreatorParams = {
  addonId: string,
  client: RemoteFirefox,
  sourceDir: string,
  artifactsDir: string,
  onSourceChange?: OnSourceChangeFn,
};

export type WatcherCreatorFn = (params: WatcherCreatorParams) => Watchpack;

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


// defaultReloadStrategy types and implementation.

export type ReloadStrategyParams = {
  addonId: string,
  firefoxApp: FirefoxProcess,
  client: RemoteFirefox,
  profile: FirefoxProfile,
  sourceDir: string,
  artifactsDir: string,
};

export type ReloadStrategyOptions = {
  createWatcher?: WatcherCreatorFn,
};

export function defaultReloadStrategy(
  {
    addonId, firefoxApp, client, profile, sourceDir, artifactsDir,
  }: ReloadStrategyParams,
  {
    createWatcher=defaultWatcherCreator,
  }: ReloadStrategyOptions = {}
): void {
  let watcher: Watchpack;

  firefoxApp.on('close', () => {
    client.disconnect();
    watcher.close();
  });

  watcher = createWatcher({addonId, client, sourceDir, artifactsDir});
}


// defaultFirefoxClient types and implementation.

export type CreateFirefoxClientParams = {
  connectToFirefox?: FirefoxConnectorFn,
  maxRetries: number,
  retryInterval: number,
};

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


// Run command types and implementation.

export type CmdRunParams = {
  sourceDir: string,
  artifactsDir: string,
  firefox: string,
  firefoxProfile: string,
  preInstall: boolean,
  noReload: boolean,
};

export type CmdRunOptions = {
  firefoxApp: typeof defaultFirefox,
  firefoxClient: typeof defaultFirefoxClient,
  reloadStrategy: typeof defaultReloadStrategy,
};

export default function run(
  {
    sourceDir, artifactsDir, firefox, firefoxProfile,
    preInstall=false, noReload=false,
  }: CmdRunParams,
  {
    firefoxApp=defaultFirefox,
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

  let runner;
  let profile;
  let client;
  let runningFirefox;
  let addonId;

  return getValidatedManifest(sourceDir)
    .then((manifestData) => {
      return new ExtensionRunner({
        sourceDir,
        firefoxApp,
        firefox,
        manifestData,
        profilePath: firefoxProfile,
      });
    })
    .then((extRunner: ExtensionRunner) => {
      runner = extRunner;
      return runner.getProfile().then((fxProfile: FirefoxProfile) => {
        profile = fxProfile;
      });
    })
    .then(() => {
      return new Promise(
        (resolve) => {
          if (!preInstall) {
            log.debug('Deferring extension installation until after ' +
                      'connecting to the remote debugger');
            resolve();
          } else {
            log.debug('Pre-installing extension as a proxy file');
            resolve(runner.installAsProxy(profile).then((installedAddonId) => {
              installed = true;
              addonId = installedAddonId;
            }));
          }
        });
    })
    .then(() => {
      return runner.run(profile).then((firefoxChildProcess) => {
        runningFirefox = firefoxChildProcess;
      });
    })
    .then(() => {
      if (requiresRemote) {
        return firefoxClient().then((remoteFirefoxClient) => {
          client = remoteFirefoxClient;
        });
      }
    })
    .then(() => {
      if (installed) {
        log.debug('Not installing as temporary add-on because the ' +
                  'add-on was already installed');
      } else {
        return runner.installAsTemporaryAddon(client)
          .then((installResult: FirefoxRDPResponseAddon) => {
            addonId = installResult.addon.id;
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
    .then(() => {
      if (noReload) {
        log.debug('Extension auto-reloading has been disabled');
      } else {
        if (!addonId) {
          throw new WebExtError(
            'Unexpected missing addonId in the installAsTemporaryAddon result'
          );
        }

        log.debug(
          `Reloading extension when the source changes; id=${addonId}`);
        reloadStrategy({
          firefoxApp: runningFirefox,
          profile, client, sourceDir, artifactsDir, addonId,
        });
      }
      return firefoxApp;
    });
}


// ExtensionRunner types and implementation.

export type ExtensionRunnerParams = {
  sourceDir: string,
  manifestData: ExtensionManifest,
  profilePath: string,
  firefoxApp: typeof defaultFirefox,
  firefox: string,
};

export class ExtensionRunner {
  sourceDir: string;
  manifestData: ExtensionManifest;
  profilePath: string;
  firefoxApp: typeof defaultFirefox;
  firefox: string;

  constructor(
    {
      firefoxApp, sourceDir, manifestData,
      profilePath, firefox,
    }: ExtensionRunnerParams
  ) {
    this.sourceDir = sourceDir;
    this.manifestData = manifestData;
    this.profilePath = profilePath;
    this.firefoxApp = firefoxApp;
    this.firefox = firefox;
  }

  getProfile(): Promise<FirefoxProfile> {
    const {firefoxApp, profilePath} = this;
    return new Promise((resolve) => {
      if (profilePath) {
        log.debug(`Copying Firefox profile from ${profilePath}`);
        resolve(firefoxApp.copyProfile(profilePath));
      } else {
        log.debug('Creating new Firefox profile');
        resolve(firefoxApp.createProfile());
      }
    });
  }

  installAsTemporaryAddon(
    client: RemoteFirefox
  ): Promise<FirefoxRDPResponseAddon> {
    return client.installTemporaryAddon(this.sourceDir);
  }

  installAsProxy(profile: FirefoxProfile): Promise<string|void> {
    const {firefoxApp, sourceDir, manifestData} = this;
    return firefoxApp.installExtension(
      {
        manifestData,
        asProxy: true,
        extensionPath: sourceDir,
        profile,
      })
      .then(() => getManifestId(manifestData));
  }

  run(profile: FirefoxProfile): Promise<FirefoxProcess> {
    const {firefoxApp, firefox} = this;
    return firefoxApp.run(profile, {firefox});
  }
}

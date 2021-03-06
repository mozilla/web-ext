/* @flow */
import { fs } from 'mz';

import defaultBuildExtension from './build';
import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import * as defaultFirefoxApp from '../firefox';
import {
  connectWithMaxRetries as defaultFirefoxClient,
} from '../firefox/remote';
import {createLogger} from '../util/logger';
import defaultGetValidatedManifest from '../util/manifest';
import {UsageError} from '../../src/errors';
import {
  createExtensionRunner,
  defaultReloadStrategy,
  MultiExtensionRunner as DefaultMultiExtensionRunner,
} from '../extension-runners';
// Import objects that are only used as Flow types.
import type {FirefoxPreferences} from '../firefox/preferences';

const log = createLogger(__filename);


// Run command types and implementation.

export type CmdRunParams = {|
  artifactsDir: string,
  browserConsole: boolean,
  pref?: FirefoxPreferences,
  firefox: string,
  firefoxProfile?: string,
  profileCreateIfMissing?: boolean,
  ignoreFiles?: Array<string>,
  keepProfileChanges: boolean,
  noInput?: boolean,
  noReload: boolean,
  preInstall: boolean,
  sourceDir: string,
  watchFile?: Array<string>,
  watchIgnored?: Array<string>,
  startUrl?: Array<string>,
  target?: Array<string>,
  args?: Array<string>,

  // Android CLI options.
  adbBin?: string,
  adbHost?: string,
  adbPort?: string,
  adbDevice?: string,
  adbDiscoveryTimeout?: number,
  adbRemoveOldArtifacts?: boolean,
  firefoxApk?: string,
  firefoxApkComponent?: string,

  // Chromium Desktop CLI options.
  chromiumBinary?: string,
  chromiumProfile?: string,
|};

export type CmdRunOptions = {|
  buildExtension: typeof defaultBuildExtension,
  desktopNotifications: typeof defaultDesktopNotifications,
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxClient,
  reloadStrategy: typeof defaultReloadStrategy,
  shouldExitProgram?: boolean,
  MultiExtensionRunner?: typeof DefaultMultiExtensionRunner,
  getValidatedManifest?: typeof defaultGetValidatedManifest,
|};

export default async function run(
  {
    artifactsDir,
    browserConsole = false,
    pref,
    firefox,
    firefoxProfile,
    profileCreateIfMissing,
    keepProfileChanges = false,
    ignoreFiles,
    noInput = false,
    noReload = false,
    preInstall = false,
    sourceDir,
    watchFile,
    watchIgnored,
    startUrl,
    target,
    args,
    // Android CLI options.
    adbBin,
    adbHost,
    adbPort,
    adbDevice,
    adbDiscoveryTimeout,
    adbRemoveOldArtifacts,
    firefoxApk,
    firefoxApkComponent,
    // Chromium CLI options.
    chromiumBinary,
    chromiumProfile,
  }: CmdRunParams,
  {
    buildExtension = defaultBuildExtension,
    desktopNotifications = defaultDesktopNotifications,
    firefoxApp = defaultFirefoxApp,
    firefoxClient = defaultFirefoxClient,
    reloadStrategy = defaultReloadStrategy,
    MultiExtensionRunner = DefaultMultiExtensionRunner,
    getValidatedManifest = defaultGetValidatedManifest,
  }: CmdRunOptions = {}): Promise<DefaultMultiExtensionRunner> {

  log.info(`Running web extension from ${sourceDir}`);
  if (preInstall) {
    log.info('Disabled auto-reloading because it\'s not possible with ' +
             '--pre-install');
    noReload = true;
  }

  if (watchFile != null && (!Array.isArray(watchFile) ||
      !watchFile.every((el) => typeof el === 'string'))) {
    throw new UsageError('Unexpected watchFile type');
  }

  // Create an alias for --pref since it has been transformed into an
  // object containing one or more preferences.
  const customPrefs = pref;
  const manifestData = await getValidatedManifest(sourceDir);

  const profileDir = firefoxProfile || chromiumProfile;

  if (profileCreateIfMissing) {
    if (!profileDir) {
      throw new UsageError(
        '--profile-create-if-missing requires ' +
        '--firefox-profile or --chromium-profile'
      );
    }
    const isDir = fs.existsSync(profileDir);
    if (isDir) {
      log.info(`Profile directory ${profileDir} already exists`);
    } else {
      log.info(`Profile directory not found. Creating directory ${profileDir}`);
      await fs.mkdir(profileDir);
    }
  }

  const runners = [];

  const commonRunnerParams = {
    // Common options.
    extensions: [{sourceDir, manifestData}],
    keepProfileChanges,
    startUrl,
    args,
    desktopNotifications,
  };

  if (!target || target.length === 0 || target.includes('firefox-desktop')) {
    const firefoxDesktopRunnerParams = {
      ...commonRunnerParams,

      // Firefox specific CLI options.
      firefoxBinary: firefox,
      profilePath: firefoxProfile,
      customPrefs,
      browserConsole,
      preInstall,

      // Firefox runner injected dependencies.
      firefoxApp,
      firefoxClient,
    };

    const firefoxDesktopRunner = await createExtensionRunner({
      target: 'firefox-desktop',
      params: firefoxDesktopRunnerParams,
    });
    runners.push(firefoxDesktopRunner);
  }

  if (target && target.includes('firefox-android')) {
    const firefoxAndroidRunnerParams = {
      ...commonRunnerParams,

      // Firefox specific CLI options.
      profilePath: firefoxProfile,
      customPrefs,
      browserConsole,
      preInstall,
      firefoxApk,
      firefoxApkComponent,
      adbDevice,
      adbHost,
      adbPort,
      adbBin,
      adbDiscoveryTimeout,
      adbRemoveOldArtifacts,

      // Injected dependencies.
      firefoxApp,
      firefoxClient,
      desktopNotifications: defaultDesktopNotifications,
      buildSourceDir: (extensionSourceDir: string, tmpArtifactsDir: string) => {
        return buildExtension({
          sourceDir: extensionSourceDir,
          ignoreFiles,
          asNeeded: false,
          // Use a separate temporary directory for building the extension zip file
          // that we are going to upload on the android device.
          artifactsDir: tmpArtifactsDir,
        }, {
          // Suppress the message usually logged by web-ext build.
          showReadyMessage: false,
        });
      },
    };

    const firefoxAndroidRunner = await createExtensionRunner({
      target: 'firefox-android',
      params: firefoxAndroidRunnerParams,
    });
    runners.push(firefoxAndroidRunner);
  }

  if (target && target.includes('chromium')) {
    const chromiumRunnerParams = {
      ...commonRunnerParams,
      chromiumBinary,
      chromiumProfile,
    };

    const chromiumRunner = await createExtensionRunner({
      target: 'chromium',
      params: chromiumRunnerParams,
    });
    runners.push(chromiumRunner);
  }

  const extensionRunner = new MultiExtensionRunner({
    desktopNotifications,
    runners,
  });

  await extensionRunner.run();

  if (noReload) {
    log.info('Automatic extension reloading has been disabled');
  } else {
    log.info('The extension will reload if any source file changes');

    reloadStrategy({
      extensionRunner,
      sourceDir,
      watchFile,
      watchIgnored,
      artifactsDir,
      ignoreFiles,
      noInput,
    });
  }

  return extensionRunner;
}

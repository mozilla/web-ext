/* @flow */
import defaultADB from 'adbkit';

import build from './build';
import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import * as defaultFirefoxApp from '../firefox';
import {
  connectWithMaxRetries as defaultFirefoxClient,
} from '../firefox/remote';
import {createLogger} from '../util/logger';
import defaultGetValidatedManifest from '../util/manifest';
import {
  defaultReloadStrategy,
  MultiExtensionRunner as DefaultMultiExtensionRunner,
  FirefoxDesktopExtensionRunner as DefaultFirefoxDesktopExtensionRunner,
  FirefoxAndroidExtensionRunner as defaultFirefoxAndroidExtensionRunner,
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
  ignoreFiles?: Array<string>,
  keepProfileChanges: boolean,
  noInput?: boolean,
  noReload: boolean,
  preInstall: boolean,
  sourceDir: string,
  startUrl?: string | Array<string>,
  target?: string | Array<string>,

  // Android CLI options.
  adbBinary?: string,
  adbHost?: string,
  adbPort?: string,
  adbDevice?: string,
  firefoxApk?: string,
|};

export type CmdRunOptions = {|
  desktopNotifications: typeof defaultDesktopNotifications,
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxClient,
  reloadStrategy: typeof defaultReloadStrategy,
  shouldExitProgram?: boolean,
  FirefoxAndroidExtensionRunner?: typeof defaultFirefoxAndroidExtensionRunner,
  FirefoxDesktopExtensionRunner?: typeof DefaultFirefoxDesktopExtensionRunner,
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
    keepProfileChanges = false,
    ignoreFiles,
    noInput = false,
    noReload = false,
    preInstall = false,
    sourceDir,
    startUrl,
    target,
    // Android CLI options.
    adbBinary,
    adbHost,
    adbPort,
    adbDevice,
    firefoxApk,
  }: CmdRunParams,
  {
    desktopNotifications = defaultDesktopNotifications,
    firefoxApp = defaultFirefoxApp,
    firefoxClient = defaultFirefoxClient,
    reloadStrategy = defaultReloadStrategy,
    FirefoxAndroidExtensionRunner = defaultFirefoxAndroidExtensionRunner,
    FirefoxDesktopExtensionRunner = DefaultFirefoxDesktopExtensionRunner,
    MultiExtensionRunner = DefaultMultiExtensionRunner,
    getValidatedManifest = defaultGetValidatedManifest,
  }: CmdRunOptions = {}): Promise<DefaultMultiExtensionRunner> {

  log.info(`Running web extension from ${sourceDir}`);
  if (preInstall) {
    log.info('Disabled auto-reloading because it\'s not possible with ' +
             '--pre-install');
    noReload = true;
  }

  // Create an alias for --pref since it has been transformed into an
  // object containing one or more preferences.
  const customPrefs = pref;
  const manifestData = await getValidatedManifest(sourceDir);

  const runners = [];

  const commonRunnerParams = {
    // Common options.
    extensions: [{sourceDir, manifestData}],
    keepProfileChanges,
    startUrl,
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

    const firefoxDesktopRunner = new FirefoxDesktopExtensionRunner(
      firefoxDesktopRunnerParams
    );

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
      adbDevice,
      adbHost,
      adbPort,
      adbBinary,

      // Injected dependencies.
      firefoxApp,
      firefoxClient,
      adb: defaultADB,
      desktopNotifications: defaultDesktopNotifications,
      buildSourceDir: (extensionSourceDir: string) => {
        return build({
          sourceDir: extensionSourceDir,
          artifactsDir,
          ignoreFiles,
          asNeeded: false,
          // TODO: choose a different artifactsDir for safety?
          overwriteDest: true,
        });
      },
    };

    const firefoxAndroidRunner = new FirefoxAndroidExtensionRunner({
      ...commonRunnerParams,
      ...firefoxAndroidRunnerParams,
    });

    runners.push(firefoxAndroidRunner);
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
      artifactsDir,
      ignoreFiles,
      noInput,
    });
  }

  return extensionRunner;
}

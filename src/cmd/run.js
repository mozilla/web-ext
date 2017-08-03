/* @flow */

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
} from '../extension-runners';
// Import objects that are only used as Flow types.
import type {FirefoxPreferences} from '../firefox/preferences';

const log = createLogger(__filename);

// Run command types and implementation.

export type CmdRunParams = {|
  sourceDir: string,
  artifactsDir: string,
  firefox: string,
  firefoxProfile?: string,
  keepProfileChanges: boolean,
  preInstall: boolean,
  noReload: boolean,
  browserConsole: boolean,
  customPrefs?: FirefoxPreferences,
  startUrl?: string | Array<string>,
  ignoreFiles?: Array<string>,
|};

export type CmdRunOptions = {|
  desktopNotifications: typeof defaultDesktopNotifications,
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxClient,
  reloadStrategy: typeof defaultReloadStrategy,
  shouldExitProgram?: boolean,
  FirefoxDesktopExtensionRunner?: typeof DefaultFirefoxDesktopExtensionRunner,
  MultiExtensionRunner?: typeof DefaultMultiExtensionRunner,
  getValidatedManifest?: typeof defaultGetValidatedManifest,
|};

export default async function run(
  {
    sourceDir, artifactsDir, firefox, firefoxProfile,
    keepProfileChanges = false, preInstall = false, noReload = false,
    browserConsole = false, customPrefs, startUrl, ignoreFiles,
  }: CmdRunParams,
  {
    desktopNotifications = defaultDesktopNotifications,
    firefoxApp = defaultFirefoxApp,
    firefoxClient = defaultFirefoxClient,
    reloadStrategy = defaultReloadStrategy,
    FirefoxDesktopExtensionRunner = DefaultFirefoxDesktopExtensionRunner,
    MultiExtensionRunner = DefaultMultiExtensionRunner,
    getValidatedManifest = defaultGetValidatedManifest,
  }: CmdRunOptions = {}): Promise<Object> {

  log.info(`Running web extension from ${sourceDir}`);
  if (preInstall) {
    log.info('Disabled auto-reloading because it\'s not possible with ' +
             '--pre-install');
    noReload = true;
  }

  const manifestData = await getValidatedManifest(sourceDir);

  const firefoxDesktopRunnerParams = {
    // Common options.
    extensions: [{sourceDir, manifestData}],
    keepProfileChanges,
    startUrl,
    desktopNotifications,

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

  const extensionRunner = new MultiExtensionRunner({
    runners: [firefoxDesktopRunner],
    desktopNotifications,
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
    });
  }

  return firefoxApp;
}

/* @flow */

/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Firefox for Android instance.
 */

import path from 'path';

import defaultADB from 'adbkit';

import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import {
  isErrorWithCode,
  MultiExtensionsReloadError,
  UsageError,
  WebExtError,
} from '../errors';
import * as defaultFirefoxApp from '../firefox';
import {
  connectWithMaxRetries as defaultFirefoxConnector,
} from '../firefox/remote';
import {createLogger} from '../util/logger';
import type {
  ExtensionRunnerParams,
  ExtensionRunnerReloadResult,
} from './base';
import type {
  FirefoxPreferences,
} from '../firefox/preferences';
import type {
  FirefoxRDPResponseAddon,
  RemoteFirefox,
} from '../firefox/remote';
import type {
  ExtensionBuildResult,
} from '../cmd/build';

export type FirefoxAndroidExtensionRunnerParams = {|
  ...ExtensionRunnerParams,

  // Firefox specific.
  customPrefs?: FirefoxPreferences,

  // Not supported (currently ignored with logged warning).
  preInstall?: boolean,
  browserConsole?: boolean,

  // Firefox android injected dependencies.
  adbBinary?: string,
  adbHost?: string,
  adbPort?: string,
  adbDevice?: string,
  firefoxApk?: string,

  // Injected Dependencies.
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxConnector,
  adb: typeof defaultADB,
  buildSourceDir: (string) => Promise<ExtensionBuildResult>,
  desktopNotifications: typeof defaultDesktopNotifications,
|};

const log = createLogger(__filename);

/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Firefox for Desktop instance.
 */

export class FirefoxAndroidExtensionRunner {
  params: FirefoxAndroidExtensionRunnerParams;
  adbClient: any; // TODO: better flow typing here.
  selectedAdbDevice: {id: string};
  selectedFirefoxApk: string;
  selectedArtifactsDir: string;
  selectedRDPSocketFile: string;
  selectedTCPPort: number;
  cleanupCallbacks: Set<Function>;
  adbExtensionsPathBySourceDir: Map<string, string>;
  reloadableExtensions: Map<string, string>;
  remoteFirefox: RemoteFirefox;

  constructor(params: FirefoxAndroidExtensionRunnerParams) {
    this.params = params;
    this.cleanupCallbacks = new Set();
    this.adbExtensionsPathBySourceDir = new Map();
    this.reloadableExtensions = new Map();
  }

  async run(): Promise<void> {
    const {
      adb,
      adbBinary,
      adbHost,
      adbPort,
    } = this.params;
    // Print warning for not currently supported options (e.g. preInstall,
    // cloned profiles, browser console).
    this.printIgnoredParamsWarnings();

    this.adbClient = adb.createClient({
      bin: adbBinary,
      host: adbHost,
      port: adbPort,
    });

    await this.adbDevicesDiscoveryAndSelect();
    await this.apkPackagesDiscoveryAndSelect();
    await this.adbForceStopSelectedPackage();

    // Create profile prefs (with enabled remote RDP server), prepare the
    // artifacts and temporary directory on the selected device, and
    // push the profile preferences to the remote profile dir.
    await this.adbPrepareProfileDir();

    // Start Firefox for Android instance on the created profile.
    await this.adbStartSelectedPackage();

    // Build and push to devices all the extension xpis
    // and keep track of the xpi built and uploaded by extension sourceDir.
    await this.buildAndPushExtensions();

    // Wait for RDP unix socket file created and
    // Create an ADB forward connection on a free tcp port
    await this.adbDiscoveryAndForwardRDPUnixSocket();

    // Connect to RDP socket on the local tcp server, install all the pushed extension
    // and keep track of the built and installed extension by extension sourceDir.
    await this.rdpInstallExtensions();
  }

  // Method exported from the IExtensionRunner interface.

  /**
   * Returns the runner name.
   */
  getName() {
    return 'Firefox Android';
  }

  /**
   * Reloads all the extensions, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadAllExtensions(): Promise<Array<ExtensionRunnerReloadResult>> {
    const runnerName = this.getName();
    const reloadErrors = new Map();

    for (const {sourceDir} of this.params.extensions) {
      const [res] = await this.reloadExtensionBySourceDir(sourceDir);
      if (res.reloadError instanceof Error) {
        reloadErrors.set(sourceDir, res.reloadError);
      }
    }

    if (reloadErrors.size > 0) {
      return [{
        runnerName,
        reloadError: new MultiExtensionsReloadError(reloadErrors),
      }];
    }

    return [{runnerName}];
  }

  /**
   * Reloads a single extension, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadExtensionBySourceDir(
    extensionSourceDir: string
  ): Promise<Array<ExtensionRunnerReloadResult>> {
    const runnerName = this.getName();
    const addonId = this.reloadableExtensions.get(extensionSourceDir);

    if (!addonId) {
      return [{
        sourceDir: extensionSourceDir,
        reloadError: new WebExtError(
          'Extension not reloadable: ' +
            `no addonId has been mapped to "${extensionSourceDir}"`
        ),
        runnerName,
      }];
    }

    try {
      await this.buildAndPushExtension(extensionSourceDir);
      await this.remoteFirefox.reloadAddon(addonId);
    } catch (error) {
      return [{
        sourceDir: extensionSourceDir,
        reloadError: error,
        runnerName,
      }];
    }

    return [{runnerName, sourceDir: extensionSourceDir}];
  }

  /**
   * Register a callback to be called when the runner has been exited
   * (e.g. the Firefox instance exits or the user has requested web-ext
   * to exit).
   */
  registerCleanup(fn: Function): void {
    this.cleanupCallbacks.add(fn);
  }

  /**
   * Exits the runner, by closing the managed Firefox instance.
   */
  async exit(): Promise<void> {
    const {
      adbClient,
      selectedAdbDevice,
      selectedArtifactsDir,
    } = this;

    // If a Firefox for Android instance has been started,
    // we should ensure that it has been stopped when we exit.
    await this.adbForceStopSelectedPackage();

    if (selectedArtifactsDir) {
      log.info('Cleanup temporary dir created on the Android device...');
      await adbClient.shell(selectedAdbDevice.id, [
        'rm', '-rf', selectedArtifactsDir,
      ]);
    }

    // Call all the registered clenaup callbacks.
    for (const fn of this.cleanupCallbacks) {
      try {
        fn();
      } catch (error) {
        log.error(error);
      }
    }
  }

  // Private helper methods.

  getDeviceProfileDir(): string {
    if (!this.selectedArtifactsDir) {
      throw new WebExtError('Unexpected undefined artifact dir');
    }

    return `${this.selectedArtifactsDir}/profile`;
  }

  printIgnoredParamsWarnings() {
    if (this.params.profilePath) {
      log.warn(
        'Firefox for Android target does not support custom profile paths.'
      );
    }

    if (this.params.keepProfileChanges) {
      log.warn(
        'Firefox for Android target does not support --keep-profile-changes.'
      );
    }

    if (this.params.browserConsole) {
      log.warn(
        'Firefox for Android target does not support --browser-console option.'
      );
    }

    if (this.params.preInstall) {
      log.warn(
        'Firefox for Android target does not support --pre-install option.'
      );
    }

    if (this.params.startUrl) {
      log.warn(
        'Firefox for Android target does not support --start-url option.'
      );
    }

    if (this.params.adbHost && (this.params.adbHost || this.params.adbPort)) {
      log.warn(
        'Firefox for Android target ignored --adb-binary option because' +
        ' --adb-host or --adb-port have been specifed.'
      );
    }
  }

  async adbDevicesDiscoveryAndSelect() {
    const {adbClient} = this;
    const {adbDevice} = this.params;
    let devices = [];

    try {
      log.debug('Listing android devices');
      devices = await adbClient.listDevices();
    } catch (error) {
      if (isErrorWithCode('ENOENT', error) &&
          error.message.includes('spawn adb')) {
        throw new UsageError(
          'No adb executable has been found. ' +
          'You can Use --adb-bin, --adb-host/--adb-port ' +
          'to configure it manually if needed.');
      }

      throw error;
    }

    if (devices.length === 0) {
      throw new UsageError('No Android device found through ADB.');
    }

    if (!adbDevice) {
      const devicesMsg = devices.map((dev) => ` - ${dev.id}`).join('\n');
      log.info(`\nAndroid devices found:\n${devicesMsg}`);
      throw new UsageError(
        'Select an android device using --android-device');
    }

    const foundDevices = devices.filter((device) => {
      return device.id === adbDevice;
    });

    if (foundDevices.length === 0) {
      const devicesMsg = JSON.stringify(devices);
      throw new UsageError(
        `Android Device not found: ${adbDevice} in ${devicesMsg}`);
    }

    this.selectedAdbDevice = foundDevices[0];
    log.info(`Selected adb device: ${this.selectedAdbDevice.id}`);
  }

  async apkPackagesDiscoveryAndSelect() {
    const {
      adbClient,
      selectedAdbDevice,
      params: {
        adb,
        firefoxApk,
      },
    } = this;
    // Discovery and select a Firefox for Android version.
    const pmList = await adbClient.shell(selectedAdbDevice.id, [
      'pm', 'list', 'packages',
    ]).then(adb.util.readAll);

    const packages = pmList.toString().split('\n')
                           .map((line) => line.replace('package:', '').trim())
                           .filter((line) => {
                             return (
                               line.startsWith('org.mozilla.fennec') ||
                               line.startsWith('org.mozilla.firefox')
                             );
                           });

    if (packages.length === 0) {
      throw new UsageError(
        'No Firefox packages found of the selected Android device');
    }

    const pkgsListMsg = (pkgs) => {
      return pkgs.map((pkg) => ` - ${ pkg}`).join('\n');
    };

    if (!firefoxApk) {
      log.info(`\nPackages found:\n${pkgsListMsg(packages)}`);
      throw new UsageError('Select one of the packages using --firefox-apk');
    }

    const filteredPackages = packages.filter((line) => line === firefoxApk);

    if (filteredPackages.length === 0) {
      const pkgsList = pkgsListMsg(filteredPackages);
      throw new UsageError(`Package not found: ${firefoxApk} in ${pkgsList}`);
    }

    this.selectedFirefoxApk = filteredPackages[0];
    log.info(`Selected Firefox for Android APK: ${this.selectedFirefoxApk}`);
  }

  async adbForceStopSelectedPackage() {
    const {
      adbClient,
      selectedAdbDevice,
      selectedFirefoxApk,
      params: {
        adb,
      },
    } = this;
    log.info(`Stop any existent instance of ${selectedFirefoxApk}...`);
    await adbClient.shell(selectedAdbDevice.id, [
      'am', 'force-stop', selectedFirefoxApk,
    ]).then(adb.util.readAll);
  }

  async adbPrepareProfileDir() {
    const {
      adbClient,
      selectedAdbDevice,
      selectedFirefoxApk,
      params: {
        firefoxApp,
      },
    } = this;
    // Create the preferences file and the Fennec temporary profile.
    log.info(`Preparing a temporary profile for ${selectedFirefoxApk}...`);
    const profile = await firefoxApp.createProfile({app: 'fennec'});

    this.selectedArtifactsDir = `/sdcard/web-ext-artifacts-${Date.now()}`;

    const deviceProfileDir = this.getDeviceProfileDir();

    await adbClient.shell(selectedAdbDevice.id, [
      'mkdir', '-p', deviceProfileDir,
    ]);
    await adbClient.push(selectedAdbDevice.id, `${profile.profileDir}/user.js`,
                         `${deviceProfileDir}/user.js`);
    log.debug(`Created temporary profile at ${deviceProfileDir}.`);
  }

  async adbStartSelectedPackage() {
    const {
      adbClient,
      selectedFirefoxApk,
      selectedAdbDevice,
    } = this;

    const deviceProfileDir = this.getDeviceProfileDir();

    log.info(
      `Starting ${selectedFirefoxApk} on the profile ${deviceProfileDir}...`
    );
    await adbClient.startActivity(selectedAdbDevice.id, {
      wait: true,
      action: 'android.activity.MAIN',
      component: `${selectedFirefoxApk}/.App`,
      extras: [
        {
          key: 'args',
          value: `-profile ${deviceProfileDir}`,
        },
      ],
    });
  }

  buildAndPushExtension(sourceDir: string) {
    const {
      adbClient,
      selectedAdbDevice,
      selectedArtifactsDir,
      params: {
        buildSourceDir,
      },
    } = this;

    return Promise.resolve().then(async () => {
      const {extensionPath} = await buildSourceDir(sourceDir);

      const extFileName = path.basename(extensionPath, '.zip');

      let adbExtensionPath = this.adbExtensionsPathBySourceDir.get(sourceDir);

      if (!adbExtensionPath) {
        adbExtensionPath = `${selectedArtifactsDir}/${extFileName}.xpi`;
      }

      log.debug(`Uploading ${extFileName} on the android device`);

      await adbClient.push(
        selectedAdbDevice.id, extensionPath, adbExtensionPath
      ).then(function(transfer) {
        return new Promise((resolve) => {
          // TODO: show progress in the console
          transfer.on('end', resolve);
        });
      });

      log.debug(`Upload completed: ${adbExtensionPath}`);

      this.adbExtensionsPathBySourceDir.set(sourceDir, adbExtensionPath);
    });
  }

  async buildAndPushExtensions() {
    for (const {sourceDir} of this.params.extensions) {
      await this.buildAndPushExtension(sourceDir);
    }
  }

  async adbDiscoveryAndForwardRDPUnixSocket() {
    const {
      adbClient,
      selectedAdbDevice,
      selectedFirefoxApk,
      params: {
        adb,
      },
    } = this;
    // Firefox for Android debugger socket discovery.
    let androidUnixSockets = [];

    // TODO: implement exit on Ctrl-C
    while (androidUnixSockets.length === 0) {
      log.info(`Waiting ${selectedFirefoxApk} to be ready... ` +
               '(it can take a while on an ARM emulator)');
      androidUnixSockets = await adbClient.shell(selectedAdbDevice.id, [
        'cat', '/proc/net/unix',
      ]).then(adb.util.readAll);

      androidUnixSockets = androidUnixSockets.toString()
        .split('\n').filter((line) => {
          return line.trim().endsWith('firefox-debugger-socket');
        });

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Got a debugger socket file to connect
    this.selectedRDPSocketFile = androidUnixSockets[0].split(/\s/)
                                                      .slice(-2, -1)[0];
    log.debug(`RDP Socket File selected: ${this.selectedRDPSocketFile}`);

    // TODO: find a free port
    const tcpPort = await this.chooseLocalTcpPort(6010);
    await adbClient.forward(selectedAdbDevice.id, `tcp:${tcpPort}`,
                            `localfilesystem:${this.selectedRDPSocketFile}`);
    this.selectedTCPPort = tcpPort;
  }

  async chooseLocalTcpPort(basePort: number): Promise<number> {
    return basePort;
  }

  async rdpInstallExtensions() {
    const {
      selectedTCPPort,
      params: {
        extensions,
        firefoxClient,
      },
    } = this;

    const remoteFirefox = this.remoteFirefox = await firefoxClient({
      port: selectedTCPPort,
    });

    // Exit and clenaup the extension runner if the connection to the
    // remote Firefox for Android instance has been closed.
    remoteFirefox.client.on('disconnect', () => {
      log.debug('Exit on remote Firefox for Android connection disconnected');
      this.exit();
    });

    // Install all the temporary addons.
    for (const extension of extensions) {
      const {sourceDir} = extension;
      const adbExtensionPath = this.adbExtensionsPathBySourceDir.get(
        sourceDir
      );

      if (!adbExtensionPath) {
        throw new WebExtError(
          `Unexpected missing android device extension path for: ${sourceDir}`
        );
      }

      const addonId = await (
        remoteFirefox.installTemporaryAddon(adbExtensionPath)
          .then((installResult: FirefoxRDPResponseAddon) => {
            return installResult.addon.id;
          })
      );

      if (!addonId) {
        throw new WebExtError(
          'Unexpected missing addonId in the installAsTemporaryAddon result'
        );
      }

      this.reloadableExtensions.set(extension.sourceDir, addonId);
    }
  }
}

/* @flow */

/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Firefox for Android instance.
 */

import path from 'path';
import readline from 'readline';

import {withTempDir} from '../util/temp-dir';
import DefaultADBUtils from '../util/adb';
import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import {
  MultiExtensionsReloadError,
  UsageError,
  WebExtError,
} from '../errors';
import * as defaultFirefoxApp from '../firefox';
import {
  connectWithMaxRetries as defaultFirefoxConnector,
  findFreeTcpPort,
} from '../firefox/remote';
import {createLogger} from '../util/logger';
import {isTTY, setRawMode} from '../util/stdin';
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

const log = createLogger(__filename);

const ignoredParams = {
  profilePath: '--profile-path',
  keepProfileChanges: '--keep-profile-changes',
  browserConsole: '--browser-console',
  preInstall: '--pre-install',
  startUrl: '--start-url',
  args: '--args',
};

const getIgnoredParamsWarningsMessage = (optionName) => {
  return `The Firefox for Android target does not support ${optionName}`;
};

export type FirefoxAndroidExtensionRunnerParams = {|
  ...ExtensionRunnerParams,

  // Firefox specific.
  customPrefs?: FirefoxPreferences,

  // Not supported (currently ignored with logged warning).
  preInstall?: boolean,
  browserConsole?: boolean,

  // Firefox android injected dependencies.
  adbBin?: string,
  adbHost?: string,
  adbPort?: string,
  adbDevice?: string,
  adbDiscoveryTimeout?: number,
  adbCleanArtifacts?: boolean,
  firefoxApk?: string,
  firefoxApkComponent?: string,

  // Injected Dependencies.
  firefoxApp: typeof defaultFirefoxApp,
  firefoxClient: typeof defaultFirefoxConnector,
  ADBUtils?: typeof DefaultADBUtils,
  buildSourceDir: (string, string) => Promise<ExtensionBuildResult>,
  desktopNotifications: typeof defaultDesktopNotifications,
  stdin?: stream$Readable,
|};

/**
 * Implements an IExtensionRunner which manages a Firefox for Android instance.
 */
export class FirefoxAndroidExtensionRunner {
  // Wait 3s before the next unix socket discovery loop.
  static unixSocketDiscoveryRetryInterval = 3 * 1000;
  // Wait for at most 3 minutes before giving up.
  static unixSocketDiscoveryMaxTime = 3 * 60 * 1000;

  params: FirefoxAndroidExtensionRunnerParams;
  adbUtils: DefaultADBUtils;
  exiting: boolean;
  selectedAdbDevice: string;
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

    // Print warning for not currently supported options (e.g. preInstall,
    // cloned profiles, browser console).
    this.printIgnoredParamsWarnings();
  }

  async run(): Promise<void> {
    const {
      adbBin,
      adbHost,
      adbPort,
      ADBUtils = DefaultADBUtils,
    } = this.params;

    this.adbUtils = new ADBUtils({
      adbBin, adbHost, adbPort,
    });

    await this.adbDevicesDiscoveryAndSelect();
    await this.apkPackagesDiscoveryAndSelect();
    await this.adbCheckRuntimePermissions();
    await this.adbForceStopSelectedPackage();

    // Create profile prefs (with enabled remote RDP server), prepare the
    // artifacts and temporary directory on the selected device, and
    // push the profile preferences to the remote profile dir.
    await this.adbPrepareProfileDir();

    // NOTE: running Firefox for Android on the Android Emulator can be
    // pretty slow, we can run the following 3 steps in parallel to speed up
    // it a bit.
    await Promise.all([
      // Start Firefox for Android instance if not started yet.
      // (Fennec would run in an temporary profile and so it is explicitly
      // stopped, Fenix runs on its usual profile and so it may be already
      // running).
      this.adbStartSelectedPackage(),

      // Build and push to devices all the extension xpis
      // and keep track of the xpi built and uploaded by extension sourceDir.
      this.buildAndPushExtensions(),

      // Wait for RDP unix socket file created and
      // Create an ADB forward connection on a free tcp port
      this.adbDiscoveryAndForwardRDPUnixSocket(),
    ]);

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
      adbUtils,
      selectedAdbDevice,
      selectedArtifactsDir,
    } = this;

    this.exiting = true;

    // If a Firefox for Android instance has been started,
    // we should ensure that it has been stopped when we exit.
    await this.adbForceStopSelectedPackage();

    if (selectedArtifactsDir) {
      log.debug('Cleaning up artifacts directory on the Android device...');
      await adbUtils.clearArtifactsDir(selectedAdbDevice);
    }

    // Call all the registered cleanup callbacks.
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
    return `${this.selectedArtifactsDir}/profile`;
  }

  printIgnoredParamsWarnings() {
    Object.keys(ignoredParams).forEach((ignoredParam) => {
      if (this.params[ignoredParam]) {
        log.warn(
          getIgnoredParamsWarningsMessage(ignoredParams[ignoredParam])
        );
      }
    });
  }

  async adbDevicesDiscoveryAndSelect() {
    const {adbUtils} = this;
    const {adbDevice} = this.params;
    let devices = [];

    log.debug('Listing android devices');
    devices = await adbUtils.discoverDevices();

    if (devices.length === 0) {
      throw new UsageError(
        'No Android device found through ADB. ' +
        'Make sure the device is connected and USB debugging is enabled.'
      );
    }

    if (!adbDevice) {
      const devicesMsg = devices.map((dev) => ` - ${dev}`).join('\n');
      log.info(`\nAndroid devices found:\n${devicesMsg}`);
      throw new UsageError(
        'Select an android device using --android-device=<name>');
    }

    const foundDevices = devices.filter((device) => {
      return device === adbDevice;
    });

    if (foundDevices.length === 0) {
      const devicesMsg = JSON.stringify(devices);
      throw new UsageError(
        `Android device ${adbDevice} was not found in list: ${devicesMsg}`);
    }

    this.selectedAdbDevice = foundDevices[0];
    log.info(`Selected ADB device: ${this.selectedAdbDevice}`);
  }

  async apkPackagesDiscoveryAndSelect() {
    const {
      adbUtils,
      selectedAdbDevice,
      params: {
        firefoxApk,
      },
    } = this;
    // Discovery and select a Firefox for Android version.
    const packages = await adbUtils.discoverInstalledFirefoxAPKs(
      selectedAdbDevice,
      firefoxApk
    );

    if (packages.length === 0) {
      throw new UsageError(
        'No Firefox packages were found on the selected Android device');
    }

    const pkgsListMsg = (pkgs) => {
      return pkgs.map((pkg) => ` - ${ pkg}`).join('\n');
    };

    if (!firefoxApk) {
      log.info(`\nPackages found:\n${pkgsListMsg(packages)}`);

      if (packages.length > 1) {
        throw new UsageError('Select one of the packages using --firefox-apk');
      }

      // If only one APK has been found, select it even if it has not been
      // specified explicitly on the comment line.
      this.selectedFirefoxApk = packages[0];
      log.info(`Selected Firefox for Android APK: ${this.selectedFirefoxApk}`);
      return;
    }

    const filteredPackages = packages.filter((line) => line === firefoxApk);

    if (filteredPackages.length === 0) {
      const pkgsList = pkgsListMsg(filteredPackages);
      throw new UsageError(
        `Package ${firefoxApk} was not found in list: ${pkgsList}`
      );
    }

    this.selectedFirefoxApk = filteredPackages[0];
    log.debug(`Selected Firefox for Android APK: ${this.selectedFirefoxApk}`);
  }

  async adbForceStopSelectedPackage() {
    const {
      adbUtils,
      selectedAdbDevice,
      selectedFirefoxApk,
    } = this;

    log.info(`Stopping existing instances of ${selectedFirefoxApk}...`);
    await adbUtils.amForceStopAPK(selectedAdbDevice, selectedFirefoxApk);
  }

  async adbOldArtifactsDir(removeArtifacts?: boolean) {
    const {
      adbUtils,
      selectedAdbDevice,
    } = this;

    const foundDirectories = await adbUtils.checkOrCleanArtifacts(
      selectedAdbDevice, removeArtifacts
    );

    if (!foundDirectories) {
      return;
    }
    if (removeArtifacts) {
      log.info('Old web-ext artifacts have been found and removed ' +
              `from ${selectedAdbDevice} device`);
    } else {
      log.warn(
        `Old artifacts directories have been found on ${selectedAdbDevice} ` +
        'device. Use --adb-clean-artifacts to remove them automatically.'
      );
    }
  }

  async adbCheckRuntimePermissions() {
    const {
      adbUtils,
      selectedAdbDevice,
      selectedFirefoxApk,
    } = this;

    log.debug(`Discovering Android version for ${selectedAdbDevice}...`);

    const androidVersion = await adbUtils.getAndroidVersionNumber(
      selectedAdbDevice
    );

    if (typeof androidVersion !== 'number' || Number.isNaN(androidVersion)) {
      throw new WebExtError(`Invalid Android version: ${androidVersion}`);
    }

    log.debug(`Detected Android version ${androidVersion}`);

    if (androidVersion < 23) {
      return;
    }

    log.debug('Checking read/write permissions needed for web-ext' +
              `on ${selectedFirefoxApk}...`);

    // Runtime permission needed to be able to run Firefox on a temporarily created profile
    // on android versions >= 23 (Android Marshmallow, which is the first version where
    // these permissions are optional and have to be granted explicitly).
    const requiredPermissions = [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ];

    await adbUtils.ensureRequiredAPKRuntimePermissions(
      selectedAdbDevice, selectedFirefoxApk, requiredPermissions
    );
  }

  async adbPrepareProfileDir() {
    const {
      adbUtils,
      selectedAdbDevice,
      selectedFirefoxApk,
      params: {
        customPrefs,
        firefoxApp,
      },
    } = this;
    // Create the preferences file and the Fennec temporary profile.
    log.debug(`Preparing a temporary profile for ${selectedFirefoxApk}...`);

    const profile = await firefoxApp.createProfile({
      app: 'fennec',
      customPrefs,
    });

    //Checking for older artifacts
    await this.adbOldArtifactsDir(this.params.adbCleanArtifacts);

    // Choose a artifacts dir name for the assets pushed to the
    // Android device.
    this.selectedArtifactsDir = await adbUtils.getOrCreateArtifactsDir(
      selectedAdbDevice
    );

    const deviceProfileDir = this.getDeviceProfileDir();

    await adbUtils.runShellCommand(selectedAdbDevice, [
      'mkdir', '-p', deviceProfileDir,
    ]);
    await adbUtils.pushFile(selectedAdbDevice,
                            path.join(profile.profileDir, 'user.js'),
                            `${deviceProfileDir}/user.js`);

    log.debug(`Created temporary profile at ${deviceProfileDir}.`);
  }

  async adbStartSelectedPackage() {
    const {
      adbUtils,
      selectedFirefoxApk,
      selectedAdbDevice,
      params: {
        firefoxApkComponent,
      },
    } = this;

    const deviceProfileDir = this.getDeviceProfileDir();

    log.info(`Starting ${selectedFirefoxApk}...`);

    log.debug(`Using profile ${deviceProfileDir} (ignored by Fenix)`);

    await adbUtils.startFirefoxAPK(
      selectedAdbDevice,
      selectedFirefoxApk,
      firefoxApkComponent,
      deviceProfileDir,
    );
  }

  async buildAndPushExtension(sourceDir: string) {
    const {
      adbUtils,
      selectedAdbDevice,
      selectedArtifactsDir,
      params: {
        buildSourceDir,
      },
    } = this;

    await withTempDir(async (tmpDir) => {
      const {extensionPath} = await buildSourceDir(sourceDir, tmpDir.path());

      const extFileName = path.basename(extensionPath, '.zip');

      let adbExtensionPath = this.adbExtensionsPathBySourceDir.get(sourceDir);

      if (!adbExtensionPath) {
        adbExtensionPath = `${selectedArtifactsDir}/${extFileName}.xpi`;
      }

      log.debug(`Uploading ${extFileName} on the android device`);

      await adbUtils.pushFile(
        selectedAdbDevice, extensionPath, adbExtensionPath
      );

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
      adbUtils,
      selectedAdbDevice,
      selectedFirefoxApk,
      params: {
        adbDiscoveryTimeout,
      },
    } = this;

    const stdin = this.params.stdin || process.stdin;

    const {
      unixSocketDiscoveryRetryInterval,
    } = FirefoxAndroidExtensionRunner;

    let {
      unixSocketDiscoveryMaxTime,
    } = FirefoxAndroidExtensionRunner;

    if (typeof adbDiscoveryTimeout === 'number') {
      unixSocketDiscoveryMaxTime = adbDiscoveryTimeout;
    }

    const handleCtrlC = (str, key) => {
      if (key.ctrl && key.name === 'c') {
        adbUtils.setUserAbortDiscovery(true);
      }
    };

    // TODO: use noInput property to decide if we should
    // disable direct keypress handling.
    if (isTTY(stdin)) {
      readline.emitKeypressEvents(stdin);
      setRawMode(stdin, true);

      stdin.on('keypress', handleCtrlC);
    }

    try {
      const msg = (
        `Waiting for ${selectedFirefoxApk} Remote Debugging Server...` +
        '\nMake sure to enable "Remote Debugging via USB" ' +
        'from Settings -> Developer Tools if it is not yet enabled.'
      );

      log.info(`\n${msg}\n`);

      // Got a debugger socket file to connect.
      this.selectedRDPSocketFile = (
        await adbUtils.discoverRDPUnixSocket(
          selectedAdbDevice, selectedFirefoxApk, {
            maxDiscoveryTime: unixSocketDiscoveryMaxTime,
            retryInterval: unixSocketDiscoveryRetryInterval,
          }
        )
      );
    } finally {
      if (isTTY(stdin)) {
        stdin.removeListener('keypress', handleCtrlC);
      }
    }

    log.debug(`RDP Socket File selected: ${this.selectedRDPSocketFile}`);

    const tcpPort = await findFreeTcpPort();

    // Log the choosen tcp port at info level (useful to the user to be able
    // to connect the Firefox DevTools to the Firefox for Android instance).
    log.info(`You can connect to this Android device on TCP port ${tcpPort}`);

    const forwardSocketSpec = this.selectedRDPSocketFile.startsWith('@') ?
      `localabstract:${this.selectedRDPSocketFile.substr(1)}`
      : `localfilesystem:${this.selectedRDPSocketFile}`;

    await adbUtils.setupForward(
      selectedAdbDevice,
      forwardSocketSpec,
      `tcp:${tcpPort}`
    );

    this.selectedTCPPort = tcpPort;
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

    // Exit and cleanup the extension runner if the connection to the
    // remote Firefox for Android instance has been closed.
    remoteFirefox.client.on('end', () => {
      if (!this.exiting) {
        log.info('Exiting the device because Firefox for Android disconnected');
        this.exit();
      }
    });

    // Install all the temporary addons.
    for (const extension of extensions) {
      const {sourceDir} = extension;
      const adbExtensionPath = this.adbExtensionsPathBySourceDir.get(
        sourceDir
      );

      if (!adbExtensionPath) {
        throw new WebExtError(
          `ADB extension path for "${sourceDir}" was unexpectedly empty`
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
          'Received an empty addonId from ' +
          `remoteFirefox.installTemporaryAddon("${adbExtensionPath}")`
        );
      }

      this.reloadableExtensions.set(extension.sourceDir, addonId);
    }
  }
}

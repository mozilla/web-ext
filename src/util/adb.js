/* @flow */
import defaultADB from '@devicefarmer/adbkit';

import {
  isErrorWithCode,
  UsageError,
  WebExtError,
} from '../errors';
import {createLogger} from '../util/logger';
import packageIdentifiers, {
  defaultApkComponents,
} from '../firefox/package-identifiers';

export const DEVICE_DIR_BASE = '/data/local/tmp/';
export const ARTIFACTS_DIR_PREFIX = 'web-ext-artifacts-';

const log = createLogger(__filename);

export type ADBUtilsParams = {|
  adb?: typeof defaultADB,
  // ADB configs.
  adbBin?: string,
  adbHost?: string,
  adbPort?: string,
  adbDevice?: string,
|};

export type DiscoveryParams = {|
  maxDiscoveryTime: number,
  retryInterval: number,
|};

// Helper function used to raise an UsageError when the adb binary has not been found.
async function wrapADBCall(asyncFn: (...any) => Promise<any>): Promise<any> {
  try {
    return await asyncFn();
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
}

export default class ADBUtils {
  params: ADBUtilsParams;
  adb: typeof defaultADB;
  adbClient: any; // TODO: better flow typing here.

  // Map<deviceId -> artifactsDir>
  artifactsDirMap: Map<string, string>;
  // Toggled when the user wants to abort the RDP Unix Socket discovery loop
  // while it is still executing.
  userAbortDiscovery: boolean;

  constructor(params: ADBUtilsParams) {
    this.params = params;

    const {
      adb,
      adbBin,
      adbHost,
      adbPort,
    } = params;

    this.adb = adb || defaultADB;

    this.adbClient = this.adb.createClient({
      bin: adbBin,
      host: adbHost,
      port: adbPort,
    });

    this.artifactsDirMap = new Map();

    this.userAbortDiscovery = false;
  }

  runShellCommand(
    deviceId: string, cmd: string | Array<string>
  ): Promise<string> {
    const {adb, adbClient} = this;

    log.debug(`Run adb shell command on ${deviceId}: ${JSON.stringify(cmd)}`);

    return wrapADBCall(async () => {
      return await adbClient.shell(deviceId, cmd).then(adb.util.readAll);
    }).then((res) => res.toString());
  }

  async discoverDevices(): Promise<Array<string>> {
    const {adbClient} = this;

    let devices = [];

    log.debug('Listing android devices');
    devices = await wrapADBCall(async () => adbClient.listDevices());

    return devices.map((dev) => dev.id);
  }

  async discoverInstalledFirefoxAPKs(
    deviceId: string,
    firefoxApk?: string
  ): Promise<Array<string>> {
    log.debug(`Listing installed Firefox APKs on ${deviceId}`);

    const pmList = await this.runShellCommand(deviceId, [
      'pm', 'list', 'packages',
    ]);

    return pmList.split('\n')
      .map((line) => line.replace('package:', '').trim())
      .filter((line) => {
        // Look for an exact match if firefoxApk is defined.
        if (firefoxApk) {
          return line === firefoxApk;
        }
        // Match any package name that starts with the package name of a Firefox for Android browser.
        for (const browser of packageIdentifiers) {
          if (line.startsWith(browser)) {
            return true;
          }
        }

        return false;
      });
  }

  async getAndroidVersionNumber(deviceId: string): Promise<number> {
    const androidVersion = (await this.runShellCommand(deviceId, [
      'getprop', 'ro.build.version.sdk',
    ])).trim();

    const androidVersionNumber = parseInt(androidVersion);

    // No need to check the granted runtime permissions on Android versions < Lollypop.
    if (isNaN(androidVersionNumber)) {
      throw new WebExtError(
        'Unable to discovery android version on ' +
        `${deviceId}: ${androidVersion}`
      );
    }

    return androidVersionNumber;
  }

  // Raise an UsageError when the given APK does not have the required runtime permissions.
  async ensureRequiredAPKRuntimePermissions(
    deviceId: string, apk: string, permissions: Array<string>
  ): Promise<void> {
    const permissionsMap = {};

    // Initialize every permission to false in the permissions map.
    for (const perm of permissions) {
      permissionsMap[perm] = false;
    }

    // Retrieve the permissions information for the given apk.
    const pmDumpLogs = (await this.runShellCommand(deviceId, [
      'pm', 'dump', apk,
    ])).split('\n');

    // Set to true the required permissions that have been granted.
    for (const line of pmDumpLogs) {
      for (const perm of permissions) {
        if (line.includes(`${perm}: granted=true`) ||
            line.includes(`${perm}, granted=true`)) {
          permissionsMap[perm] = true;
        }
      }
    }

    for (const perm of permissions) {
      if (!permissionsMap[perm]) {
        throw new UsageError(
          `Required ${perm} has not be granted for ${apk}. ` +
          'Please grant them using the Android Settings ' +
          'or using the following adb command:\n' +
          `\t adb shell pm grant ${apk} ${perm}\n`
        );
      }
    }
  }

  async amForceStopAPK(deviceId: string, apk: string): Promise<void> {
    await this.runShellCommand(deviceId, [
      'am', 'force-stop', apk,
    ]);
  }

  async getOrCreateArtifactsDir(deviceId: string): Promise<string> {
    let artifactsDir = this.artifactsDirMap.get(deviceId);

    if (artifactsDir) {
      return artifactsDir;
    }

    artifactsDir = `${DEVICE_DIR_BASE}${ARTIFACTS_DIR_PREFIX}${Date.now()}`;

    const testDirOut = (await this.runShellCommand(
      deviceId, `test -d ${artifactsDir} ; echo $?`
    )).trim();

    if (testDirOut !== '1') {
      throw new WebExtError(
        `Cannot create artifacts directory ${artifactsDir} ` +
        `because it exists on ${deviceId}.`
      );
    }

    await this.runShellCommand(deviceId, ['mkdir', '-p', artifactsDir]);

    this.artifactsDirMap.set(deviceId, artifactsDir);

    return artifactsDir;
  }

  async detectOrRemoveOldArtifacts(
    deviceId: string, removeArtifactDirs?: boolean = false
  ): Promise<boolean> {
    const {adbClient} = this;

    log.debug('Checking adb device for existing web-ext artifacts dirs');

    return wrapADBCall(async () => {
      const files = await adbClient.readdir(deviceId, DEVICE_DIR_BASE);
      let found = false;

      for (const file of files) {
        if (!file.isDirectory() ||
            !file.name.startsWith(ARTIFACTS_DIR_PREFIX)) {
          continue;
        }

        // Return earlier if we only need to warn the user that some
        // existing artifacts dirs have been found on the adb device.
        if (!removeArtifactDirs) {
          return true;
        }

        found = true;

        const artifactsDir = `${DEVICE_DIR_BASE}${file.name}`;

        log.debug(
          `Removing artifacts directory ${artifactsDir} from device ${deviceId}`
        );

        await this.runShellCommand(deviceId, ['rm', '-rf', artifactsDir]);
      }

      return found;
    });
  }

  async clearArtifactsDir(deviceId: string): Promise<void> {
    const artifactsDir = this.artifactsDirMap.get(deviceId);

    if (!artifactsDir) {
      // nothing to do here.
      return;
    }

    this.artifactsDirMap.delete(deviceId);

    log.debug(
      `Removing ${artifactsDir} artifacts directory on ${deviceId} device`
    );

    await this.runShellCommand(deviceId, ['rm', '-rf', artifactsDir]);
  }

  async pushFile(
    deviceId: string, localPath: string, devicePath: string
  ): Promise<void> {
    const {adbClient} = this;

    log.debug(`Pushing ${localPath} to ${devicePath} on ${deviceId}`);

    await wrapADBCall(async () => {
      await adbClient.push(deviceId, localPath, devicePath)
        .then(function(transfer) {
          return new Promise((resolve) => {
            transfer.on('end', resolve);
          });
        });
    });
  }

  async startFirefoxAPK(
    deviceId: string,
    apk: string,
    apkComponent: ?string,
    deviceProfileDir: string,
  ): Promise<void> {
    const {adbClient} = this;

    log.debug(
      `Starting ${apk} on ${deviceId}`
    );

    // Fenix does ignore the -profile parameter, on the contrary Fennec
    // would run using the given path as the profile to be used during
    // this execution.
    const extras = [{
      key: 'args',
      value: `-profile ${deviceProfileDir}`,
    }];

    if (!apkComponent) {
      apkComponent = '.App';
      if (defaultApkComponents[apk]) {
        apkComponent = defaultApkComponents[apk];
      }
    } else if (!apkComponent.includes('.')) {
      apkComponent = `.${apkComponent}`;
    }

    // if `apk` is a browser package or the `apk` has a
    // browser package prefix: prepend the package identifier
    // before `apkComponent`
    if (apkComponent.startsWith('.')) {
      for (const browser of packageIdentifiers) {
        if (apk === browser || apk.startsWith(`${browser}.`)) {
          apkComponent = browser + apkComponent;
        }
      }
    }

    // if `apkComponent` starts with a '.', then adb will expand
    // the following to: `${apk}/${apk}.${apkComponent}`
    const component = `${apk}/${apkComponent}`;

    await wrapADBCall(async () => {
      await adbClient.startActivity(deviceId, {
        wait: true,
        action: 'android.activity.MAIN',
        component,
        extras,
      });
    });
  }

  setUserAbortDiscovery(value: boolean) {
    this.userAbortDiscovery = value;
  }

  async discoverRDPUnixSocket(
    deviceId: string, apk: string,
    {maxDiscoveryTime, retryInterval}: DiscoveryParams = {}
  ): Promise<string> {
    let rdpUnixSockets = [];

    const discoveryStartedAt = Date.now();
    const msg = (
      `Waiting for ${apk} Remote Debugging Server...` +
      '\nMake sure to enable "Remote Debugging via USB" ' +
      'from Settings -> Developer Tools if it is not yet enabled.'
    );

    while (rdpUnixSockets.length === 0) {
      log.info(msg);
      if (this.userAbortDiscovery) {
        throw new UsageError(
          'Exiting Firefox Remote Debugging socket discovery on user request'
        );
      }

      if (Date.now() - discoveryStartedAt > maxDiscoveryTime) {
        throw new WebExtError(
          'Timeout while waiting for the Android Firefox Debugger Socket'
        );
      }

      rdpUnixSockets = (await this.runShellCommand(deviceId, [
        'cat', '/proc/net/unix',
      ])).split('\n').filter((line) => {
        // The RDP unix socket is expected to be a path in the form:
        //   /data/data/org.mozilla.fennec_rpl/firefox-debugger-socket
        return line.trim().endsWith(`${apk}/firefox-debugger-socket`);
      });

      if (rdpUnixSockets.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }

    // Convert into an array of unix socket filenames.
    rdpUnixSockets = rdpUnixSockets.map((line) => {
      return line.trim().split(/\s/).pop();
    });

    if (rdpUnixSockets.length > 1) {
      throw new WebExtError(
        'Unexpected multiple RDP sockets: ' +
        `${JSON.stringify(rdpUnixSockets)}`
      );
    }

    return rdpUnixSockets[0];
  }

  async setupForward(deviceId: string, remote: string, local: string) {
    const {adbClient} = this;

    // TODO(rpl): we should use adb.listForwards and reuse the existing one if any (especially
    // because adbkit doesn't seem to support `adb forward --remote` yet).
    log.debug(`Configuring ADB forward for ${deviceId}: ${remote} -> ${local}`);

    await wrapADBCall(async () => {
      await adbClient.forward(deviceId, local, remote);
    });
  }
}

export async function listADBDevices(adbBin?: string): Promise<Array<string>> {
  const adbClient = new ADBUtils({adbBin});
  return adbClient.discoverDevices();
}

export async function listADBFirefoxAPKs(
  deviceId: string,
  adbBin?: string
): Promise<Array<string>> {
  const adbClient = new ADBUtils({adbBin});
  return adbClient.discoverInstalledFirefoxAPKs(deviceId);
}

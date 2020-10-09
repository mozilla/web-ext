/* @flow */

import EventEmitter from 'events';

import chai from 'chai';
import {afterEach, describe, it} from 'mocha';
import sinon from 'sinon';

import {
  UsageError,
  WebExtError,
} from '../../../src/errors';
import ADBUtils, {
  ARTIFACTS_DIR_PREFIX,
  DEVICE_DIR_BASE,
} from '../../../src/util/adb';
import {
  consoleStream, // instance is imported to inspect logged messages
} from '../../../src/util/logger';

const fakeADBPackageList = `
package:org.mozilla.fennec
package:org.mozilla.firefox
package:com.some.firefox.fork
package:com.some.firefox.fork2
package:org.some.other.software
`;

// NOTE: fake /proc/net/unix output format based on the output collected from
// an android system.
const fakeSocketFilePrefix = (
  '00000000: 00000003 00000000 00000000 0001 03  1857'
);

const fakeRDPUnixSocketFile = (
  '/data/data/org.mozilla.firefox/firefox-debugger-socket'
);

const fakeUnixSocketFiles = (`
${fakeSocketFilePrefix} /dev/socket/mdns
${fakeSocketFilePrefix}  ${fakeRDPUnixSocketFile}
`);

// NOTE: fake 'pm dump <APK>' output related to the granted permissions for an
// android application.
const fakeAndroidGrantedPermissionsColon = `
android.permission.READ_EXTERNAL_STORAGE: granted=true
android.permission.WRITE_EXTERNAL_STORAGE: granted=true
`;

// Some Android device uses a comma instead of a double colon
// (See #1583).
const fakeAndroidGrantedPermissionsComma = `
android.permission.READ_EXTERNAL_STORAGE, granted=true
android.permission.WRITE_EXTERNAL_STORAGE, granted=true
`;

const {assert} = chai;

function getFakeADBKit(
  {adbClient = {}, adbkitUtil = {}}: {adbClient: Object, adbkitUtil?: Object}
) {
  const fakeTransfer = new EventEmitter();
  const adbUtilReadAllStub = sinon.stub();

  adbUtilReadAllStub.onCall(0).returns(Promise.resolve(Buffer.from('')));

  const fakeADBClient = {
    listDevices: sinon.spy(() => {
      return [];
    }),
    shell: sinon.spy(() => Promise.resolve('')),
    readdir: sinon.spy(() => Promise.resolve([])),
    startActivity: sinon.spy(() => {}),
    forward: sinon.spy(() => {}),
    push: sinon.spy(() => {
      const originalOn = fakeTransfer.on.bind(fakeTransfer);
      // $FlowIgnore: ignore flow errors on this testing hack
      fakeTransfer.on = (event, cb) => {
        originalOn(event, cb);
        fakeTransfer.emit('end');
      };
      return Promise.resolve(fakeTransfer);
    }),
    ...adbClient,
  };

  return {
    fakeADBClient,
    fakeTransfer,
    createClient: sinon.spy(() => {
      return fakeADBClient;
    }),
    util: {
      readAll: adbUtilReadAllStub,
      ...adbkitUtil,
    },
  };
}

function createSpawnADBErrorSpy() {
  return sinon.spy(() => {
    const fakeADBError = new Error('spawn adb');
    // $FlowFixMe: reuse ErrorWithCode from other tests
    fakeADBError.code = 'ENOENT';
    return Promise.reject(fakeADBError);
  });
}

async function testSpawnADBUsageError(
  {
    testFn, adbClient, adbkitUtil,
  }: {
    testFn: Function, adbClient: Object, adbkitUtil?: Object,
  }
) {
  const adb = getFakeADBKit({adbClient, adbkitUtil});
  const adbUtils = new ADBUtils({adb});

  const promise = testFn(adbUtils);

  await assert.isRejected(promise, UsageError);
  await assert.isRejected(promise, /No adb executable has been found/);

  // Return the adb object to allow further assertion on the sinon spies.
  return adb;
}

describe('utils/adb', () => {
  describe('discoverDevices', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          listDevices: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.discoverDevices(),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.listDevices);
    });

    it('resolves the array of the android device ids', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          listDevices: sinon.spy(() => ([{id: 'emulator1'}, {id: 'device2'}])),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.discoverDevices();

      const devices = await assert.isFulfilled(promise);
      sinon.assert.calledOnce(adb.fakeADBClient.listDevices);
      assert.deepEqual(devices, ['emulator1', 'device2']);
    });
  });

  describe('runShellCommand', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.runShellCommand(
          'device1', 'test -d /some/dir && echo 1'
        ),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell, 'device1', 'test -d /some/dir && echo 1'
      );
    });

    it('rejects on any unexpected exception', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => {
            throw new Error('Unexpected error');
          }),
        },
      });

      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.runShellCommand(
        'device1', 'test -d /some/dir && echo 1'
      );

      await assert.isRejected(promise, /Unexpected error/);

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell, 'device1', 'test -d /some/dir && echo 1'
      );
    });

    it('resolves the shell command output as a string', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from('fake_data_result'));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.runShellCommand(
        'device1', 'echo fake_data_result'
      );
      const result = await assert.isFulfilled(promise);
      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledOnce(adb.util.readAll);
      assert.equal(result, 'fake_data_result');
    });
  });

  describe('discoverInstalledFirefoxAPKs', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.discoverInstalledFirefoxAPKs('device1'),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell, 'device1', ['pm', 'list', 'packages']
      );
    });

    it('resolves the array of the installed firefox APKs', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from(fakeADBPackageList));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.discoverInstalledFirefoxAPKs('device1');
      const packages = await assert.isFulfilled(promise);
      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledOnce(adb.util.readAll);
      assert.deepEqual(packages, ['org.mozilla.fennec', 'org.mozilla.firefox']);
    });

    it('resolves the given firefox APK with exact package name', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from(fakeADBPackageList));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.discoverInstalledFirefoxAPKs(
        'device1',
        'com.some.firefox.fork'
      );
      const packages = await assert.isFulfilled(promise);
      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledOnce(adb.util.readAll);
      assert.deepEqual(packages, ['com.some.firefox.fork']);
    });
  });

  describe('getAndroidVersionNumber', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.getAndroidVersionNumber('device1'),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell, 'device1', ['getprop', 'ro.build.version.sdk']
      );
    });

    it('rejects a WebExtError when unable to return a number', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from('UnexpectedNaN'));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.getAndroidVersionNumber('device1');

      await assert.isRejected(promise, WebExtError);
      await assert.isRejected(
        promise, 'Unable to discovery android version on device1: UnexpectedNaN'
      );

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell, 'device1', ['getprop', 'ro.build.version.sdk']
      );
    });

    it('resolves the android version number', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from('21'));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.getAndroidVersionNumber('device1');

      const versionNumber = await assert.isFulfilled(promise);
      assert.equal(versionNumber, 21);

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell, 'device1', ['getprop', 'ro.build.version.sdk']
      );
    });
  });

  describe('ensureRequiredAPKRuntimePermissions', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.ensureRequiredAPKRuntimePermissions(
          'device1', 'org.mozilla.firefox', [
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE',
          ]
        ),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell,
        'device1', ['pm', 'dump', 'org.mozilla.firefox']
      );
    });

    it('rejects an UsageError when a required permission has not been granted',
       async () => {
         const adb = getFakeADBKit({
           adbClient: {
             shell: sinon.spy(() => Promise.resolve('')),
           },
           adbkitUtil: {
             readAll: sinon.spy(() => {
               // No granted permissions in the output.
               return Promise.resolve(Buffer.from(''));
             }),
           },
         });
         const adbUtils = new ADBUtils({adb});

         const permissions = [
           'android.permission.READ_EXTERNAL_STORAGE',
           'android.permission.WRITE_EXTERNAL_STORAGE',
         ];
         const promise = adbUtils.ensureRequiredAPKRuntimePermissions(
           'device1', 'org.mozilla.firefox', permissions
         );

         await assert.isRejected(promise, UsageError);
         await assert.isRejected(
           promise,
           new RegExp(`Required ${permissions[0]} has not be granted`)
         );

         sinon.assert.calledOnce(adb.fakeADBClient.shell);
         sinon.assert.calledWith(
           adb.fakeADBClient.shell,
           'device1', ['pm', 'dump', 'org.mozilla.firefox']
         );
       });

    describe('Android Granted Permissions discovery', async () => {
      async function assertPermissions(fakeAndroidPmDump) {
        const adb = getFakeADBKit({
          adbClient: {
            shell: sinon.spy(() => Promise.resolve('')),
          },
          adbkitUtil: {
            readAll: sinon.spy(() => {
              return Promise.resolve(Buffer.from(fakeAndroidPmDump));
            }),
          },
        });
        const adbUtils = new ADBUtils({adb});

        const promise = adbUtils.ensureRequiredAPKRuntimePermissions(
          'device1', 'org.mozilla.firefox', [
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE',
          ]
        );

        await assert.isFulfilled(promise);
        sinon.assert.calledOnce(adb.fakeADBClient.shell);
        sinon.assert.calledWith(
          adb.fakeADBClient.shell,
          'device1', ['pm', 'dump', 'org.mozilla.firefox']
        );
      }

      it('detects permissions on pm versions that uses colon separator',
         () => assertPermissions(fakeAndroidGrantedPermissionsColon));

      it('detects permissions on pm versions that uses comma separator',
         () => assertPermissions(fakeAndroidGrantedPermissionsComma));
    });
  });

  describe('amForceStopAPK', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.amForceStopAPK(
          'device1', 'org.mozilla.firefox'
        ),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWith(
        adb.fakeADBClient.shell,
        'device1', ['am', 'force-stop', 'org.mozilla.firefox']
      );
    });

    it('does not reject when "am force-stop" has been called successfully',
       async () => {
         const adb = getFakeADBKit({
           adbClient: {
             shell: sinon.spy(() => Promise.resolve('')),
           },
         });
         const adbUtils = new ADBUtils({adb});

         const promise = adbUtils.amForceStopAPK(
           'device1', 'org.mozilla.firefox'
         );

         await assert.isFulfilled(promise);
         sinon.assert.calledOnce(adb.fakeADBClient.shell);
         sinon.assert.calledWith(
           adb.fakeADBClient.shell,
           'device1', ['am', 'force-stop', 'org.mozilla.firefox']
         );
       });
  });

  describe('getOrCreateArtifactsDir', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.getOrCreateArtifactsDir('device1'),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell, 'device1', /test -d (.*) ; echo \$\?/
      );
    });

    it('rejects a WebExtError if the artifact dir path exists', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('0\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.getOrCreateArtifactsDir('device1');

      await assert.isRejected(promise, WebExtError);
      await assert.isRejected(
        promise,
        /Cannot create artifacts directory (.*) because it exists on (.*)/
      );

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell, 'device1', /test -d (.*) ; echo \$\?/
      );
    });

    it('resolves to the android artifacts dir path', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('1\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.getOrCreateArtifactsDir('device1');

      const result = await assert.isFulfilled(promise);

      assert.match(result, /^\/sdcard\/web-ext-artifacts-/);

      sinon.assert.calledTwice(adb.fakeADBClient.shell);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell, 'device1', `test -d ${result} ; echo $?`
      );
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell, 'device1', ['mkdir', '-p', result]
      );
    });

    it('does not create a new artifact dir if it has been already created',
       async () => {
         const adb = getFakeADBKit({
           adbClient: {
             shell: sinon.spy(() => Promise.resolve('')),
           },
           adbkitUtil: {
             readAll: sinon.spy(() => Promise.resolve(Buffer.from('1\n'))),
           },
         });
         const adbUtils = new ADBUtils({adb});

         // Add an artifact dir to the adbUtils internal map.
         const fakeArtifactsDir = '/sdcard/web-ext-artifacts-already-created';
         adbUtils.artifactsDirMap.set('device1', fakeArtifactsDir);

         const promise = adbUtils.getOrCreateArtifactsDir('device1');

         const result = await assert.isFulfilled(promise);
         assert.equal(result, fakeArtifactsDir);

         sinon.assert.notCalled(adb.fakeADBClient.shell);
       });
  });

  describe('clearArtifactsDir', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => {
          adbUtils.artifactsDirMap.set(
            'device1', '/sdcard/webext-artifacts-fake'
          );
          return adbUtils.clearArtifactsDir('device1');
        },
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell, 'device1',
        ['rm', '-rf', '/sdcard/webext-artifacts-fake']
      );
    });

    it('removes the directory if it has been previously created', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      adbUtils.artifactsDirMap.set('device1', '/sdcard/webext-artifacts-fake');
      const promise = adbUtils.clearArtifactsDir('device1');

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell, 'device1',
        ['rm', '-rf', '/sdcard/webext-artifacts-fake']
      );
    });

    it('is a no-op if no artifacts dir has been previously created',
       async () => {
         const adb = getFakeADBKit({
           adbClient: {
             shell: sinon.spy(() => Promise.resolve('')),
           },
         });
         const adbUtils = new ADBUtils({adb});

         const promise = adbUtils.clearArtifactsDir('device1');

         await assert.isFulfilled(promise);

         sinon.assert.notCalled(adb.fakeADBClient.shell);
       });
  });

  describe('detectOrRemoveOldArtifacts', () => {
    function createFakeReaddirFile(artifactName: string, isDirectory: boolean) {
      return {
        name: artifactName,
        isDirectory: () => {
          return isDirectory;
        },
      };
    }

    const filesNotArtifactsDirs = [
      createFakeReaddirFile('not-an-artifact-dir1', true),
      createFakeReaddirFile('not-a-dir2', false),
    ];

    const filesArtifactsDirs = [
      createFakeReaddirFile(`${ARTIFACTS_DIR_PREFIX}1`, true),
      createFakeReaddirFile(`${ARTIFACTS_DIR_PREFIX}2`, true),
    ];

    const allFiles = [...filesNotArtifactsDirs, ...filesArtifactsDirs];

    const sb = sinon.createSandbox();
    const adbkitSpies = {
      adbClient: {
        readdir: sb.spy(() => Promise.resolve([])),
        shell: sb.spy(() => Promise.resolve('')),
      },
      adbkitUtil: {
        readAll: sb.spy(() => Promise.resolve(Buffer.from('1\n'))),
      },
    };

    // Reset the fakeADBClient spies after each test case.
    afterEach(() => sb.reset());

    it('does detect old artifacts directories', async () => {
      const adb = getFakeADBKit(adbkitSpies);
      const adbUtils = new ADBUtils({adb});
      const fakeADB = adb.fakeADBClient;

      fakeADB.readdir = sb.spy(async () => filesNotArtifactsDirs);

      await assert.becomes(
        adbUtils.detectOrRemoveOldArtifacts('device1', false),
        false,
        'Expected to return false when no old artifacts dirs have been found'
      );
      sinon.assert.calledOnce(fakeADB.readdir);
      sinon.assert.calledWith(fakeADB.readdir, 'device1', DEVICE_DIR_BASE);
      // Expect adbkit shell to never be called when no artifacts have been found.
      sinon.assert.notCalled(fakeADB.shell);

      adb.fakeADBClient.readdir = sb.spy(async () => allFiles);

      await assert.becomes(
        adbUtils.detectOrRemoveOldArtifacts('device1', false),
        true,
        'Expected to return true when old artifacts dirs have been found'
      );
      sinon.assert.notCalled(fakeADB.shell);
    });

    it('does optionally remove artifacts directories', async () => {
      const adb = getFakeADBKit(adbkitSpies);
      const adbUtils = new ADBUtils({adb});

      adb.fakeADBClient.readdir = sb.spy(async () => allFiles);

      await assert.becomes(
        adbUtils.detectOrRemoveOldArtifacts('device1', true),
        true,
        'Expected to return true when old artifacts dirs have been found'
      );

      sinon.assert.calledOnce(adb.fakeADBClient.readdir);
      assert.equal(
        adb.fakeADBClient.shell.callCount,
        filesArtifactsDirs.length,
      );

      for (const fakeFile of filesArtifactsDirs) {
        sinon.assert.calledWithMatch(
          adb.fakeADBClient.shell, 'device1',
          ['rm', '-rf', `${DEVICE_DIR_BASE}${fakeFile.name}`]
        );
      }
    });
  });

  describe('pushFile', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          push: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => adbUtils.pushFile(
          'device1', '/fake/src', '/fake/dest'
        ),
      });

      sinon.assert.calledOnce(adb.fakeADBClient.push);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.push, 'device1',
        '/fake/src', '/fake/dest'
      );
    });

    it('resolves when the file has been completely transfered', async () => {
      const fakeTransfer = new EventEmitter();
      const fakeTransferPromise = Promise.resolve(fakeTransfer);
      const adb = getFakeADBKit({
        adbClient: {
          push: sinon.spy(() => fakeTransferPromise),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.pushFile(
        'device1', '/fake/local/path', '/fake/remote/path'
      );

      await fakeTransferPromise;
      fakeTransfer.emit('end');

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.push);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.push,
        'device1', '/fake/local/path', 'fake/remote/path'
      );
    });
  });

  describe('startFirefoxAPK', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          startActivity: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => {
          return adbUtils.startFirefoxAPK(
            'device1',
            'org.mozilla.firefox_mybuild',
            undefined, // firefoxApkComponent
            '/fake/custom/profile/path'
          );
        },
      });

      sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.startActivity, 'device1', {
          action: 'android.activity.MAIN',
          component: 'org.mozilla.firefox_mybuild/.App',
          extras: [{
            key: 'args',
            value: '-profile /fake/custom/profile/path',
          }],
          wait: true,
        }
      );
    });

    it('starts Firefox APK on a custom profile (only used by Fennec)',
       async () => {
         const adb = getFakeADBKit({
           adbClient: {
             startActivity: sinon.spy(() => Promise.resolve()),
           },
           adbkitUtil: {
             readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
           },
         });
         const adbUtils = new ADBUtils({adb});

         const promiseCompatibilityMode = adbUtils.startFirefoxAPK(
           'device1',
           'org.mozilla.firefox_mybuild',
           undefined, // firefoxApkComponent
           '/fake/custom/profile/path',
         );

         await assert.isFulfilled(promiseCompatibilityMode);

         const expectedAdbParams = {
           action: 'android.activity.MAIN',
           component: 'org.mozilla.firefox_mybuild/.App',
           extras: [{
             key: 'args',
             value: '-profile /fake/custom/profile/path',
           }],
           wait: true,
         };

         sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
         sinon.assert.calledWithMatch(
           adb.fakeADBClient.startActivity, 'device1', expectedAdbParams);
       });

    it('starts a given APK component without a period', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          startActivity: sinon.spy(() => Promise.resolve()),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.startFirefoxAPK(
        'device1',
        'org.mozilla.geckoview_example',
        'GeckoViewActivity', // firefoxApkComponent
        '/fake/custom/profile/path',
      );

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.startActivity, 'device1', {
          action: 'android.activity.MAIN',
          component: 'org.mozilla.geckoview_example' +
            '/org.mozilla.geckoview_example.GeckoViewActivity',
          extras: [{
            key: 'args',
            value: '-profile /fake/custom/profile/path',
          }],
          wait: true,
        }
      );
    });

    it('starts a given APK component with a period', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          startActivity: sinon.spy(() => Promise.resolve()),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.startFirefoxAPK(
        'device1',
        'org.mozilla.geckoview_example',
        'org.mozilla.geckoview_example.GeckoViewActivity', // firefoxApkComponent
        '/fake/custom/profile/path',
      );

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.startActivity, 'device1', {
          action: 'android.activity.MAIN',
          component: 'org.mozilla.geckoview_example/' +
            'org.mozilla.geckoview_example.GeckoViewActivity',
          extras: [{
            key: 'args',
            value: '-profile /fake/custom/profile/path',
          }],
          wait: true,
        }
      );
    });

    it('starts a given APK component on fenix.nightly', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          startActivity: sinon.spy(() => Promise.resolve()),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.startFirefoxAPK(
        'device1',
        'org.mozilla.fenix.nightly',
        'HomeActivity', // firefoxApkComponent
        '/fake/custom/profile/path',
      );

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.startActivity, 'device1', {
          action: 'android.activity.MAIN',
          component: 'org.mozilla.fenix.nightly/' +
            'org.mozilla.fenix.HomeActivity',
          extras: [{
            key: 'args',
            value: '-profile /fake/custom/profile/path',
          }],
          wait: true,
        }
      );
    });

    it('starts without specifying an APK component', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          startActivity: sinon.spy(() => Promise.resolve()),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.startFirefoxAPK(
        'device1',
        'org.mozilla.geckoview_example',
        undefined, // firefoxApkComponent
        '/fake/custom/profile/path',
      );

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.startActivity, 'device1', {
          action: 'android.activity.MAIN',
          component: 'org.mozilla.geckoview_example/' +
            'org.mozilla.geckoview_example.App',
          extras: [{
            key: 'args',
            value: '-profile /fake/custom/profile/path',
          }],
          wait: true,
        }
      );
    });

    it('starts a fully-qualified APK component on the build-variant: ' +
      'fenix.nightly', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          startActivity: sinon.spy(() => Promise.resolve()),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.startFirefoxAPK(
        'device1',
        'org.mozilla.fenix.nightly',
        'org.mozilla.fenix.HomeActivity', // firefoxApkComponent
        '/fake/custom/profile/path',
      );

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.startActivity, 'device1', {
          action: 'android.activity.MAIN',
          component: 'org.mozilla.fenix.nightly/' +
            'org.mozilla.fenix.HomeActivity',
          extras: [{
            key: 'args',
            value: '-profile /fake/custom/profile/path',
          }],
          wait: true,
        }
      );
    });

    it('starts a given APK component that begins with a period', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          startActivity: sinon.spy(() => Promise.resolve()),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => Promise.resolve(Buffer.from('\n'))),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.startFirefoxAPK(
        'device1',
        'org.mozilla.fenix.nightly',
        '.HomeActivity', // firefoxApkComponent
        '/fake/custom/profile/path',
      );

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.startActivity);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.startActivity, 'device1', {
          action: 'android.activity.MAIN',
          component: 'org.mozilla.fenix.nightly/' +
            'org.mozilla.fenix.HomeActivity',
          extras: [{
            key: 'args',
            value: '-profile /fake/custom/profile/path',
          }],
          wait: true,
        }
      );
    });
  });

  describe('discoverRDPUnixSocket', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          shell: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => {
          return adbUtils.discoverRDPUnixSocket(
            'device1', 'org.mozilla.firefox_mybuild'
          );
        },
      });

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell,
        'device1',
        ['cat', '/proc/net/unix']
      );
    });

    it('rejects an UsageError on setUserAbortDiscovery call', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from(''));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.discoverRDPUnixSocket(
        'device1', 'org.mozilla.firefox_mybuild'
      );

      adbUtils.setUserAbortDiscovery(true);

      await assert.isRejected(promise, UsageError);
      await assert.isRejected(
        promise,
        'Exiting Firefox Remote Debugging socket discovery on user request'
      );

      sinon.assert.calledOnce(adb.fakeADBClient.shell);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.shell,
        'device1',
        ['cat', '/proc/net/unix']
      );
    });

    it('rejects a WebExtError on timeouts', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from(''));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const maxDiscoveryTime = 50;
      const retryInterval = 10;

      const promise = adbUtils.discoverRDPUnixSocket(
        'device1', 'org.mozilla.firefox_mybuild', {
          maxDiscoveryTime,
          retryInterval,
        }
      );

      await assert.isRejected(promise, WebExtError);
      await assert.isRejected(
        promise, 'Timeout while waiting for the Android Firefox Debugger Socket'
      );

      sinon.assert.called(adb.fakeADBClient.shell);
      sinon.assert.alwaysCalledWithMatch(
        adb.fakeADBClient.shell,
        'device1',
        ['cat', '/proc/net/unix']
      );
    });

    it('reminds the user to enable remote_debugging', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve('')),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(Buffer.from(''));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      consoleStream.flushCapturedLogs();
      consoleStream.makeVerbose();
      consoleStream.startCapturing();

      const promise = adbUtils.discoverRDPUnixSocket(
        'device1', 'org.mozilla.firefox_mybuild', {
          maxDiscoveryTime: 50, retryInterval: 10,
        }
      );
      await assert.isRejected(promise, WebExtError);

      const {capturedMessages} = consoleStream;
      const foundMessage = capturedMessages.find((message) =>
        message.includes('Make sure to enable "Remote Debugging via USB'));

      consoleStream.stopCapturing();

      assert.ok(foundMessage);
      assert.ok(foundMessage && foundMessage.includes('[info]'));
    });

    it('rejects a WebExtError if more than one RDP socket have been found',
       async () => {
         const adb = getFakeADBKit({
           adbClient: {
             shell: sinon.spy(() => Promise.resolve()),
           },
           adbkitUtil: {
             readAll: sinon.spy(() => {
               // Fake unexpected multiple RDP socket matches.
               return Promise.resolve(
                 Buffer.from(`${fakeUnixSocketFiles}${fakeUnixSocketFiles}`)
               );
             }),
           },
         });
         const adbUtils = new ADBUtils({adb});

         const promise = adbUtils.discoverRDPUnixSocket(
           'device1', 'org.mozilla.firefox'
         );

         await assert.isRejected(promise, WebExtError);
         await assert.isRejected(promise, /Unexpected multiple RDP sockets/);

         sinon.assert.calledOnce(adb.fakeADBClient.shell);
         sinon.assert.calledWithMatch(
           adb.fakeADBClient.shell,
           'device1',
           ['cat', '/proc/net/unix']
         );
       });

    it('resolves the android RDP unix socket path', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve()),
        },
        adbkitUtil: {
          readAll: sinon.spy(() => {
            // Fake unexpected multiple RDP socket matches.
            return Promise.resolve(Buffer.from(fakeUnixSocketFiles));
          }),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.discoverRDPUnixSocket(
        'device1', 'org.mozilla.firefox'
      );

      const result = await assert.isFulfilled(promise);

      assert.equal(result, fakeRDPUnixSocketFile);
    });
  });

  describe('setupForward', () => {
    it('rejects an UsageError on adb binary not found', async () => {
      const adb = await testSpawnADBUsageError({
        adbClient: {
          forward: createSpawnADBErrorSpy(),
        },
        testFn: (adbUtils) => {
          return adbUtils.setupForward(
            'device1', 'remote:fake', 'local:fake'
          );
        },
      });

      sinon.assert.calledOnce(adb.fakeADBClient.forward);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.forward,
        'device1', 'local:fake', 'remote:fake'
      );
    });

    it('configures an adb forwarding for a given device', async () => {
      const adb = getFakeADBKit({
        adbClient: {
          shell: sinon.spy(() => Promise.resolve()),
        },
      });
      const adbUtils = new ADBUtils({adb});

      const promise = adbUtils.setupForward(
        'device1', 'remote:fake', 'local:fake'
      );

      await assert.isFulfilled(promise);

      sinon.assert.calledOnce(adb.fakeADBClient.forward);
      sinon.assert.calledWithMatch(
        adb.fakeADBClient.forward,
        'device1', 'local:fake', 'remote:fake'
      );
    });
  });

});

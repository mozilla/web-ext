/* @flow */

import EventEmitter from 'events';

import {assert} from 'chai';
import {describe, it} from 'mocha';
import deepcopy from 'deepcopy';
import sinon from 'sinon';

import {
  FirefoxAndroidExtensionRunner,
} from '../../../src/extension-runners/firefox-android';
import type {
  FirefoxAndroidExtensionRunnerParams,
} from '../../../src/extension-runners/firefox-android';
import {
  UsageError,
  WebExtError,
} from '../../../src/errors';
import {
  basicManifest,
  getFakeFirefox,
  getFakeRemoteFirefox,
} from '../helpers';

// Fake result for client.installTemporaryAddon().then(installResult => ...)
const tempInstallResult = {
  addon: {id: 'some-addon@test-suite'},
};

// Fake missing addon id result for client.installTemporaryAddon
const tempInstallResultMissingAddonId = {
  addon: {id: null},
};

const builtFileName = 'built-ext-filename';

const fakeBuiltExtensionPath = `/fake/extensionPath/${builtFileName}.zip`;

const fakeADBPackageList = (
  'package:org.mozilla.fennec\n' +
  'package:org.mozilla.firefox'
);

const fakeSocketFilePrefix = (
  '00000000: 00000003 00000000 00000000 0001 03  1857'
);

const fakeRDPUnixSocketFile = (
  '/data/data/org.mozilla.firefox/firefox-debugger-socket'
);

const fakeUnixSocketFiles = (
  `${fakeSocketFilePrefix} /dev/socket/mdns\n` +
  `${fakeSocketFilePrefix}  ${fakeRDPUnixSocketFile}\n`
);

function getFakeADBKit({adbClient = {}, adbUtil = {}}) {
  const fakeTransfer = new EventEmitter();
  const adbUtilReadAllStub = sinon.stub();

  adbUtilReadAllStub.onCall(0).returns(Promise.resolve(new Buffer('')));


  const fakeADBClient = {
    listDevices: sinon.spy(() => {
      return [];
    }),
    shell: sinon.spy(() => Promise.resolve('')),
    startActivity: sinon.spy(() => {}),
    forward: sinon.spy(() => {}),
    push: sinon.spy(() => {
      const originalOn = fakeTransfer.on.bind(fakeTransfer);
      // $FLOW_IGNORE: ignore flow errors on this testing hack
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
      ...adbUtil,
    },
  };
}

type PrepareParams = {
  params?: Object,
  debuggerPort?: number,
  fakeFirefoxApp?: Object,
  fakeRemoteFirefox?: Object,
  fakeADBClient?: Object,
  fakeADBUtil?: Object,
  // An array for the fake data that the test get
  // from an adb shell call.
  fakeADBReadAllData?: Array<string>
}

function prepareExtensionRunnerParams({
  debuggerPort,
  fakeFirefoxApp,
  fakeRemoteFirefox,
  fakeADBClient,
  fakeADBUtil,
  fakeADBReadAllData = [],
  params,
}: PrepareParams = {}) {
  const fakeRemoteFirefoxClient = new EventEmitter();
  const remoteFirefox = getFakeRemoteFirefox({
    installTemporaryAddon: sinon.spy(
      () => Promise.resolve(tempInstallResult)
    ),
    ...fakeRemoteFirefox,
  });
  remoteFirefox.client = fakeRemoteFirefoxClient;

  const fakeADBKit = getFakeADBKit({
    adbClient: fakeADBClient, adbUtil: fakeADBUtil,
  });

  const adbUtilReadAllStub = fakeADBKit.util.readAll;

  for (const [idx, value] of fakeADBReadAllData.entries()) {
    // Fake the data read from adb.util.readAll after adbClient.shell has been used
    // to run a command on the device.
    adbUtilReadAllStub.onCall(idx).returns(Promise.resolve(
      new Buffer(value)
    ));
  }

  // $FLOW_IGNORE: allow overriden params for testing purpose.
  const runnerParams: FirefoxAndroidExtensionRunnerParams = {
    extensions: [{
      sourceDir: '/fake/sourceDir',
      manifestData: deepcopy(basicManifest),
    }],
    keepProfileChanges: false,
    browserConsole: false,
    startUrl: undefined,
    firefoxBinary: 'firefox',
    preInstall: false,
    firefoxApp: getFakeFirefox({
      ...fakeFirefoxApp,
    }, debuggerPort),
    adb: fakeADBKit,
    firefoxClient: sinon.spy(() => {
      return Promise.resolve(remoteFirefox);
    }),
    desktopNotifications: sinon.spy(() => {}),
    ...(params || {}),
  };

  return {
    remoteFirefox,
    params: runnerParams,
  };
}

describe('util/extension-runners/firefox-android', () => {

  describe('raises an UsageError when', () => {

    async function testUsageError(prepareTestParams, testExceptionCallback) {
      const {params} = prepareExtensionRunnerParams(prepareTestParams);
      const runnerInstance = new FirefoxAndroidExtensionRunner(params);

      let actualException;

      try {
        await runnerInstance.run();
      } catch (error) {
        actualException = error;
      }

      const {adb} = params;
      return testExceptionCallback({adb, actualException});
    }

    it('does not find an adb binary', async () => {
      await testUsageError({
        fakeADBClient: {
          listDevices: sinon.spy(() => {
            const fakeADBError = new Error('spawn adb');
            // $FLOW_FIXME: reuse ErrorWithCode from other tests
            fakeADBError.code = 'ENOENT';
            return Promise.reject(fakeADBError);
          }),
        },
      }, ({adb, actualException}) => {
        sinon.assert.calledOnce(adb.createClient);
        sinon.assert.calledOnce(adb.fakeADBClient.listDevices);

        assert.ok(actualException instanceof UsageError);
        assert.match(actualException && actualException.message,
                     /No adb executable has been found/);
      });
    });

    it('does not find any android device', async () => {
      await testUsageError({}, ({adb, actualException}) => {
        sinon.assert.calledOnce(adb.createClient);
        sinon.assert.calledOnce(adb.fakeADBClient.listDevices);

        assert.ok(actualException instanceof UsageError);
        assert.match(actualException && actualException.message,
                     /No Android device found/);
      });
    });

    it('does not know which is the selected android device', async () => {
      await testUsageError({
        fakeADBClient: {
          listDevices: sinon.spy(() => {
            return Promise.resolve([
              {id: 'emulator-1'}, {id: 'emulator-2'},
            ]);
          }),
        },
      }, ({adb, actualException}) => {
        sinon.assert.calledOnce(adb.createClient);
        sinon.assert.calledOnce(adb.fakeADBClient.listDevices);

        assert.ok(actualException instanceof UsageError);
        assert.match(actualException && actualException.message,
                     /Select an android device using --android-device/);
      });
    });

    it('does not find the selected android device', async () => {
      await testUsageError({
        params: {
          adbDevice: 'emultator-3',
        },
        fakeADBClient: {
          listDevices: sinon.spy(() => {
            return Promise.resolve([
              {id: 'emulator-1'}, {id: 'emulator-2'},
            ]);
          }),
        },
      }, ({adb, actualException}) => {
        sinon.assert.calledOnce(adb.createClient);
        sinon.assert.calledOnce(adb.fakeADBClient.listDevices);

        assert.ok(actualException instanceof UsageError);
        assert.match(actualException && actualException.message,
                     /Android Device not found: /);
      });
    });

    it('does not find a valid Firefox apk', async () => {
      await testUsageError({
        params: {
          adbDevice: 'emulator-1',
        },
        fakeADBClient: {
          listDevices: sinon.spy(() => {
            return Promise.resolve([
              {id: 'emulator-1'}, {id: 'emulator-2'},
            ]);
          }),
          shell: sinon.spy(() => Promise.resolve('')),
        },
      }, ({adb, actualException}) => {
        sinon.assert.calledOnce(adb.createClient);
        sinon.assert.calledOnce(adb.fakeADBClient.listDevices);
        sinon.assert.calledOnce(adb.fakeADBClient.shell);

        assert.ok(actualException instanceof UsageError);
        assert.match(
          actualException && actualException.message,
            /No Firefox packages found of the selected Android device/
        );
      });
    });

    it('does not know which Firefox apk to use', async () => {
      await testUsageError({
        params: {
          adbDevice: 'emulator-1',
        },
        fakeADBClient: {
          listDevices: sinon.spy(() => {
            return Promise.resolve([
              {id: 'emulator-1'}, {id: 'emulator-2'},
            ]);
          }),
          shell: sinon.spy(() => Promise.resolve('')),
        },
        fakeADBUtil: {
          readAll: sinon.spy(() => {
            return Promise.resolve(
              new Buffer('package:org.mozilla.fennec\n' +
                         'package:org.mozilla.firefox')
            );
          }),
        },
      }, ({adb, actualException}) => {
        sinon.assert.calledOnce(adb.createClient);
        sinon.assert.calledOnce(adb.fakeADBClient.listDevices);
        sinon.assert.calledOnce(adb.fakeADBClient.shell);

        assert.ok(actualException instanceof UsageError);
        assert.match(
          actualException && actualException.message,
            /Select one of the packages using --firefox-apk/
        );
      });
    });

    it('cannot find the Firefox apk selected using --firefox-apk value',
       async () => {
         await testUsageError({
           params: {
             adbDevice: 'emulator-1',
             firefoxApk: 'org.mozilla.f',
           },
           fakeADBClient: {
             listDevices: sinon.spy(() => {
               return Promise.resolve([
                 {id: 'emulator-1'}, {id: 'emulator-2'},
               ]);
             }),
             shell: sinon.spy(() => Promise.resolve('')),
           },
           fakeADBUtil: {
             readAll: sinon.spy(() => {
               return Promise.resolve(
                 new Buffer('package:org.mozilla.fennec\n' +
                            'package:org.mozilla.firefox')
               );
             }),
           },
         }, ({adb, actualException}) => {
           sinon.assert.calledOnce(adb.createClient);
           sinon.assert.calledOnce(adb.fakeADBClient.listDevices);
           sinon.assert.calledOnce(adb.fakeADBClient.shell);

           assert.ok(actualException instanceof UsageError);
           assert.match(
             actualException && actualException.message,
               /Package not found: /
           );
         });
       });

  });

  describe('a valid device and Firefox apk has been selected', () => {
    function prepareSelectedValidDeviceAndAPKParams(
      overriddenProperties = {}
    ) {
      const {params} = prepareExtensionRunnerParams({
        params: {
          adbDevice: 'emulator-1',
          firefoxApk: 'org.mozilla.firefox',
          buildSourceDir: sinon.spy(() => Promise.resolve({
            extensionPath: fakeBuiltExtensionPath,
          })),
        },
        fakeADBClient: {
          listDevices: sinon.spy(() => {
            return Promise.resolve([
              {id: 'emulator-1'}, {id: 'emulator-2'},
            ]);
          }),
        },
        fakeADBReadAllData: [
          // Fake the output of running "pm list" on the device
          fakeADBPackageList,
          // Fake the output of running am force-stop SELECTED_APK
          '',
          // Fake the adb shell call that discover the RDP socket.
          fakeUnixSocketFiles,
        ],
        ...overriddenProperties,
      });

      return params;
    }

    it('stops any running instances of the selected Firefox apk ' +
       'and then starts it on the temporary profile',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();
         const {adb} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.shell,
           'emulator-1', ['am', 'force-stop', 'org.mozilla.firefox']
         );

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.startActivity,
           'emulator-1', {
             wait: true,
             action: 'android.activity.MAIN',
             component: 'org.mozilla.firefox/.App',
             extras: [
               {
                 key: 'args',
                 value: `-profile ${runnerInstance.getDeviceProfileDir()}`,
               },
             ],
           },
         );

         sinon.assert.callOrder(
           adb.fakeADBClient.shell,
           adb.fakeADBClient.startActivity
         );
       });

    it('builds and pushes the extension xpi to the android device',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();
         const {adb, buildSourceDir, extensions} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         sinon.assert.calledWithMatch(
           buildSourceDir,
           extensions[0].sourceDir
         );

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.push,
           'emulator-1',
           fakeBuiltExtensionPath,
           `${runnerInstance.selectedArtifactsDir}/${builtFileName}.xpi`
         );

         sinon.assert.callOrder(buildSourceDir, adb.fakeADBClient.push);
       });

    it('discovers the RDP unix socket and forward it on a local tcp port',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();
         const {adb} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.shell,
           'emulator-1', ['cat', '/proc/net/unix']
         );

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.forward,
           'emulator-1',
           `tcp:${runnerInstance.selectedTCPPort}`,
           `localfilesystem:${runnerInstance.selectedRDPSocketFile}`
         );

         sinon.assert.callOrder(
           adb.fakeADBClient.shell,
           adb.fakeADBClient.forward
         );
       });

    it('installs the build extension as a temporarily installed addon',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();
         const {adb, firefoxClient} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         // Test that the android extension runner connects to the
         // remote debugging server on the tcp port that has been
         // chosen to forward the android device RDP unix socket file.

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.forward,
           'emulator-1',
           `tcp:${runnerInstance.selectedTCPPort}`,
           `localfilesystem:${runnerInstance.selectedRDPSocketFile}`
         );

         sinon.assert.calledWithMatch(
           firefoxClient,
           {port: runnerInstance.selectedTCPPort}
         );

         sinon.assert.calledWithMatch(
           runnerInstance.remoteFirefox.installTemporaryAddon,
           `${runnerInstance.selectedArtifactsDir}/${builtFileName}.xpi`
         );

         sinon.assert.callOrder(
           adb.fakeADBClient.forward,
           firefoxClient,
           runnerInstance.remoteFirefox.installTemporaryAddon,
         );
       });

    it('raises an error on addonId missing from installTemporaryAddon result',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams({
           fakeRemoteFirefox: {
             installTemporaryAddon: sinon.spy(
               () => Promise.resolve(tempInstallResultMissingAddonId)
             ),
           },
         });

         const expectedErrorMessage = (
           'Unexpected missing addonId in the installAsTemporaryAddon result'
         );

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run()
           .catch((error) => error)
           .then((error) => {
             assert.equal(
               error instanceof WebExtError,
               true
             );
             assert.equal(
               error && error.message,
               expectedErrorMessage
             );
           });
       });

    it('reloads all reloadable extensions when reloadAllExtensions is called',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         await runnerInstance.reloadAllExtensions();

         sinon.assert.calledOnce(runnerInstance.remoteFirefox.reloadAddon);
       });

    it('reloads an extension by sourceDir', async () => {
      const params = prepareSelectedValidDeviceAndAPKParams();

      const runnerInstance = new FirefoxAndroidExtensionRunner(params);
      await runnerInstance.run();

      await runnerInstance.reloadExtensionBySourceDir(
        params.extensions[0].sourceDir,
      );

      sinon.assert.calledOnce(runnerInstance.remoteFirefox.reloadAddon);
    });

    it('resolves to an array of WebExtError if the extension is not reloadable',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         await runnerInstance.reloadExtensionBySourceDir(
           '/non-existent/source-dir'
         ).then((results) => {
           const error = results[0].reloadError;
           assert.equal(
             error instanceof WebExtError,
             true
           );
           assert.equal(
             error && error.message,
             'Extension not reloadable: no addonId has been mapped to ' +
               '"/non-existent/source-dir"'
           );
         });

         sinon.assert.notCalled(runnerInstance.remoteFirefox.reloadAddon);
       });


    it('resolves an AllExtensionsReloadError if any extension fails to reload',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams({
           fakeRemoteFirefox: {
             reloadAddon: sinon.spy(
               () => Promise.reject(Error('Reload failure'))
             ),
           },
         });

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         await runnerInstance.reloadAllExtensions()
           .then((results) => {
             const error = results[0].reloadError;
             assert.equal(
               error instanceof WebExtError,
               true
             );
             const {sourceDir} = params.extensions[0];
             assert.ok(error && error.message.includes(
               `Error on extension loaded from ${sourceDir}: `
             ));
           });

         sinon.assert.called(runnerInstance.remoteFirefox.reloadAddon);
       });

    it('cleans the android device state when the exit method is called',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();
         const {adb} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         const cleanupCallback = sinon.spy(() => {
           throw new Error('cleanup callback error');
         });
         const anotherCallback = sinon.spy();

         runnerInstance.registerCleanup(cleanupCallback);
         runnerInstance.registerCleanup(anotherCallback);

         await runnerInstance.run();
         await runnerInstance.exit();

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.shell,
           'emulator-1', ['am', 'force-stop', params.firefoxApk]
         );

         assert.isString(runnerInstance.selectedArtifactsDir);
         assert.match(
           runnerInstance.selectedArtifactsDir,
           /^\/sdcard\/web-ext-artifacts-/
         );

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.shell,
           'emulator-1', ['rm', '-rf', runnerInstance.selectedArtifactsDir]
         );
       });

    it('calls the callback registered on cleanup when firefox closes',
       async () => {
         const params = prepareSelectedValidDeviceAndAPKParams();
         const {adb} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         const cleanupCallback = sinon.spy(() => {
           throw new Error('cleanup callback error');
         });
         const anotherCallback = sinon.spy();

         let finalCallback = () => {};

         const waitFinalCallback = new Promise((resolve) => {
           finalCallback = () => resolve();
         });

         runnerInstance.registerCleanup(cleanupCallback);
         runnerInstance.registerCleanup(anotherCallback);
         runnerInstance.registerCleanup(finalCallback);

         await runnerInstance.run();

         runnerInstance.remoteFirefox.client.emit('disconnect');

         await waitFinalCallback;

         sinon.assert.calledWithMatch(
           adb.fakeADBClient.shell,
           'emulator-1', ['am', 'force-stop', params.firefoxApk]
         );

         sinon.assert.calledOnce(cleanupCallback);
         sinon.assert.calledOnce(anotherCallback);
       });

  });

});

/* @flow */

import EventEmitter from 'events';

import {assert} from 'chai';
import {describe, it} from 'mocha';
import deepcopy from 'deepcopy';
import sinon from 'sinon';

import {consoleStream} from '../../../src/util/logger';
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
  createFakeStdin,
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

const fakeRDPUnixSocketFile = (
  '/data/data/org.mozilla.firefox/firefox-debugger-socket'
);

const fakeRDPUnixAbstractSocketFile = (
  '@org.mozilla.firefox/firefox-debugger-socket'
);

type PrepareParams = {
  params?: Object,
  debuggerPort?: number,
  fakeFirefoxApp?: Object,
  fakeRemoteFirefox?: Object,
  fakeADBUtils?: Object,
}

// Reduce the waiting time during tests.
FirefoxAndroidExtensionRunner.unixSocketDiscoveryRetryInterval = 0;

function prepareExtensionRunnerParams({
  debuggerPort,
  fakeFirefoxApp,
  fakeRemoteFirefox,
  fakeADBUtils,
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
    ADBUtils: sinon.spy(function() {
      return fakeADBUtils;
    }),
    firefoxClient: sinon.spy(() => {
      return Promise.resolve(remoteFirefox);
    }),
    desktopNotifications: sinon.spy(() => {}),
    stdin: new EventEmitter(),
    ...(params || {}),
  };

  return {
    remoteFirefox,
    params: runnerParams,
  };
}

function prepareSelectedDeviceAndAPKParams(
  overriddenProperties = {}, adbOverrides = {}) {
  const fakeADBUtils = {
    discoverDevices: sinon.spy(() => Promise.resolve([
      'emulator-1', 'emulator-2',
    ])),
    discoverInstalledFirefoxAPKs: sinon.spy(() => Promise.resolve([
      'org.mozilla.fennec', 'org.mozilla.firefox',
    ])),
    getAndroidVersionNumber: sinon.spy(() => Promise.resolve(20)),
    amForceStopAPK: sinon.spy(() => Promise.resolve()),
    discoverRDPUnixSocket: sinon.spy(
      () => Promise.resolve(fakeRDPUnixSocketFile)
    ),
    getOrCreateArtifactsDir: sinon.spy(
      () => Promise.resolve('/fake/artifacts-dir/')
    ),
    runShellCommand: sinon.spy(() => Promise.resolve('')),
    pushFile: sinon.spy(() => Promise.resolve()),
    startFirefoxAPK: sinon.spy(() => Promise.resolve()),
    setupForward: sinon.spy(() => Promise.resolve()),
    clearArtifactsDir: sinon.spy(() => Promise.resolve()),
    setUserAbortDiscovery: sinon.spy(() => {}),
    ensureRequiredAPKRuntimePermissions: sinon.spy(() => Promise.resolve()),
    ...adbOverrides,
  };

  const {params} = prepareExtensionRunnerParams({
    params: {
      adbDevice: 'emulator-1',
      firefoxApk: 'org.mozilla.firefox',
      buildSourceDir: sinon.spy(() => Promise.resolve({
        extensionPath: fakeBuiltExtensionPath,
      })),
    },
    fakeADBUtils,
    fakeFirefoxApp: {
      createProfile: sinon.spy(() => {
        return Promise.resolve({profileDir: '/path/to/fake/profile'});
      }),
    },
    ...overriddenProperties,
  });

  return {params, fakeADBUtils};
}

describe('util/extension-runners/firefox-android', () => {

  describe('raises an UsageError when:', () => {

    async function testUsageError(prepareTestParams, testExceptionCallback) {
      const {params} = prepareExtensionRunnerParams(prepareTestParams);
      const runnerInstance = new FirefoxAndroidExtensionRunner(params);

      let actualException;

      try {
        await runnerInstance.run();
      } catch (error) {
        actualException = error;
      }

      return testExceptionCallback({actualException});
    }

    it('does not find any android device', async () => {
      const fakeADBUtils = {
        discoverDevices: sinon.spy(() => Promise.resolve([])),
      };
      await testUsageError({fakeADBUtils}, ({actualException}) => {
        sinon.assert.calledOnce(fakeADBUtils.discoverDevices);

        assert.instanceOf(actualException, UsageError);
        assert.match(actualException && actualException.message,
                     /No Android device found/);
      });
    });

    it('does not know which is the selected android device', async () => {
      const fakeADBUtils = {
        discoverDevices: sinon.spy(() => Promise.resolve([
          'emulator-1', 'emulator-2',
        ])),
      };
      await testUsageError({fakeADBUtils}, ({actualException}) => {
        sinon.assert.calledOnce(fakeADBUtils.discoverDevices);

        assert.instanceOf(actualException, UsageError);
        assert.match(actualException && actualException.message,
                     /Select an android device using --android-device/);
      });
    });

    it('does not find the selected android device', async () => {
      const fakeADBUtils = {
        discoverDevices: sinon.spy(() => Promise.resolve([
          'emulator-1', 'emulator-2',
        ])),
      };

      await testUsageError({
        params: {
          adbDevice: 'emulator-3',
        },
        fakeADBUtils,
      }, ({actualException}) => {
        sinon.assert.calledOnce(fakeADBUtils.discoverDevices);

        assert.instanceOf(actualException, UsageError);
        assert.match(actualException && actualException.message,
                     /Android device emulator-3 was not found in list:/);
      });
    });

    it('does not find a valid Firefox apk', async () => {
      const fakeADBUtils = {
        discoverDevices: sinon.spy(() => Promise.resolve([
          'emulator-1', 'emulator-2',
        ])),
        discoverInstalledFirefoxAPKs: sinon.spy(() => Promise.resolve([])),
      };

      await testUsageError({
        params: {
          adbDevice: 'emulator-1',
        },
        fakeADBUtils,
      }, ({actualException}) => {
        sinon.assert.calledOnce(fakeADBUtils.discoverDevices);
        sinon.assert.calledOnce(fakeADBUtils.discoverInstalledFirefoxAPKs);

        assert.instanceOf(actualException, UsageError);
        assert.match(
          actualException && actualException.message,
          /No Firefox packages were found on the selected Android device/
        );
      });
    });

    it('does not know which Firefox apk to use', async () => {
      const fakeADBUtils = {
        discoverDevices: sinon.spy(() => Promise.resolve([
          'emulator-1', 'emulator-2',
        ])),
        discoverInstalledFirefoxAPKs: sinon.spy(() => Promise.resolve([
          'org.mozilla.fennec', 'org.mozilla.firefox',
        ])),
      };

      await testUsageError({
        params: {
          adbDevice: 'emulator-1',
        },
        fakeADBUtils,
      }, ({actualException}) => {
        sinon.assert.calledOnce(fakeADBUtils.discoverDevices);
        sinon.assert.calledOnce(fakeADBUtils.discoverInstalledFirefoxAPKs);

        assert.instanceOf(actualException, UsageError);
        assert.match(
          actualException && actualException.message,
          /Select one of the packages using --firefox-apk/
        );
      });
    });

    it('cannot find the Firefox apk selected using --firefox-apk value',
       async () => {
         const fakeADBUtils = {
           discoverDevices: sinon.spy(() => Promise.resolve([
             'emulator-1', 'emulator-2',
           ])),
           discoverInstalledFirefoxAPKs: sinon.spy(() => Promise.resolve([
             'org.mozilla.fennec', 'org.mozilla.firefox',
           ])),
         };

         await testUsageError({
           params: {
             adbDevice: 'emulator-1',
             firefoxApk: 'org.mozilla.f',
           },
           fakeADBUtils,
         }, ({actualException}) => {
           sinon.assert.calledOnce(fakeADBUtils.discoverDevices);
           sinon.assert.calledOnce(fakeADBUtils.discoverInstalledFirefoxAPKs);

           assert.instanceOf(actualException, UsageError);
           assert.match(
             actualException && actualException.message,
             /Package org.mozilla.f was not found in list:/
           );
         });
       });

  });

  describe('a valid device and Firefox apk has been selected:', () => {

    it('does select a Firefox apk if only one has been found', async () => {
      const {params, fakeADBUtils} = prepareSelectedDeviceAndAPKParams();

      fakeADBUtils.discoverInstalledFirefoxAPKs = sinon.spy(
        () => Promise.resolve(['org.mozilla.firefox'])
      );

      delete params.firefoxApk;

      const runnerInstance = new FirefoxAndroidExtensionRunner(params);

      await runnerInstance.run();

      sinon.assert.calledWithMatch(
        fakeADBUtils.amForceStopAPK,
        'emulator-1', 'org.mozilla.firefox'
      );
    });

    it('stops any running instances of the selected Firefox apk ' +
       'and then starts it on the temporary profile',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         sinon.assert.calledWithMatch(
           fakeADBUtils.amForceStopAPK,
           'emulator-1', 'org.mozilla.firefox'
         );

         sinon.assert.calledWithMatch(
           fakeADBUtils.startFirefoxAPK,
           'emulator-1', 'org.mozilla.firefox',
           runnerInstance.getDeviceProfileDir()
         );

         sinon.assert.callOrder(
           fakeADBUtils.amForceStopAPK,
           fakeADBUtils.startFirefoxAPK
         );
       });

    it('builds and pushes the extension xpi to the android device',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();
         const {buildSourceDir, extensions} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         sinon.assert.calledWithMatch(
           buildSourceDir,
           extensions[0].sourceDir
         );

         sinon.assert.calledWithMatch(
           fakeADBUtils.pushFile,
           'emulator-1',
           fakeBuiltExtensionPath,
           `${runnerInstance.selectedArtifactsDir}/${builtFileName}.xpi`
         );

         sinon.assert.callOrder(buildSourceDir, fakeADBUtils.pushFile);
       });

    it('discovers the RDP unix socket and forward it on a local tcp port',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         sinon.assert.calledWithMatch(
           fakeADBUtils.discoverRDPUnixSocket,
           'emulator-1', 'org.mozilla.firefox'
         );

         sinon.assert.calledWithMatch(
           fakeADBUtils.setupForward,
           'emulator-1',
           `localfilesystem:${runnerInstance.selectedRDPSocketFile}`,
           `tcp:${runnerInstance.selectedTCPPort}`,
         );

         sinon.assert.callOrder(
           fakeADBUtils.discoverRDPUnixSocket,
           fakeADBUtils.setupForward
         );
       });

    it('discovers the RDP abstract unix socket and forward it on',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams({}, {
           discoverRDPUnixSocket: sinon.spy(
             () => Promise.resolve(fakeRDPUnixAbstractSocketFile)
           )});

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         sinon.assert.calledWithMatch(
           fakeADBUtils.discoverRDPUnixSocket,
           'emulator-1', 'org.mozilla.firefox'
         );

         sinon.assert.calledWithMatch(
           fakeADBUtils.setupForward,
           'emulator-1',
           'localabstract:org.mozilla.firefox/firefox-debugger-socket',
           `tcp:${runnerInstance.selectedTCPPort}`,
         );

         sinon.assert.callOrder(
           fakeADBUtils.discoverRDPUnixSocket,
           fakeADBUtils.setupForward
         );
       });

    it('installs the build extension as a temporarily installed addon',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();
         const {firefoxClient} = params;

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         // Test that the android extension runner connects to the
         // remote debugging server on the tcp port that has been
         // chosen to forward the android device RDP unix socket file.

         sinon.assert.calledWithMatch(
           fakeADBUtils.setupForward,
           'emulator-1',
           `localfilesystem:${runnerInstance.selectedRDPSocketFile}`,
           `tcp:${runnerInstance.selectedTCPPort}`,
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
           fakeADBUtils.setupForward,
           firefoxClient,
           runnerInstance.remoteFirefox.installTemporaryAddon,
         );
       });

    it('raises an error on addonId missing from installTemporaryAddon result',
       async () => {
         const {params} = prepareSelectedDeviceAndAPKParams({
           fakeRemoteFirefox: {
             installTemporaryAddon: sinon.spy(
               () => Promise.resolve(tempInstallResultMissingAddonId)
             ),
           },
         });

         const expectedErrorMessage = (
           /Received an empty addonId from remoteFirefox.installTemporaryAddon/
         );

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run()
           .catch((error) => error)
           .then((error) => {
             assert.instanceOf(error, WebExtError);
             assert.match(
               error && error.message,
               expectedErrorMessage
             );
           });
       });

    it('reloads all reloadable extensions when reloadAllExtensions is called',
       async () => {
         const {params} = prepareSelectedDeviceAndAPKParams();

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         await runnerInstance.reloadAllExtensions();

         sinon.assert.calledOnce(runnerInstance.remoteFirefox.reloadAddon);
       });

    it('reloads an extension by sourceDir', async () => {
      const {params} = prepareSelectedDeviceAndAPKParams();

      const runnerInstance = new FirefoxAndroidExtensionRunner(params);
      await runnerInstance.run();

      await runnerInstance.reloadExtensionBySourceDir(
        params.extensions[0].sourceDir,
      );

      sinon.assert.calledOnce(runnerInstance.remoteFirefox.reloadAddon);
    });

    it('resolves to an array of WebExtError if the extension is not reloadable',
       async () => {
         const {params} = prepareSelectedDeviceAndAPKParams();

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         const results = await runnerInstance.reloadExtensionBySourceDir(
           '/non-existent/source-dir'
         );

         const error = results[0].reloadError;
         assert.instanceOf(error, WebExtError);
         assert.equal(
           error && error.message,
           'Extension not reloadable: no addonId has been mapped to ' +
           '"/non-existent/source-dir"'
         );

         sinon.assert.notCalled(runnerInstance.remoteFirefox.reloadAddon);
       });


    it('resolves an AllExtensionsReloadError if any extension fails to reload',
       async () => {
         const {params} = prepareSelectedDeviceAndAPKParams({
           fakeRemoteFirefox: {
             reloadAddon: sinon.spy(
               () => Promise.reject(Error('Reload failure'))
             ),
           },
         });

         const runnerInstance = new FirefoxAndroidExtensionRunner(params);
         await runnerInstance.run();

         const results = await runnerInstance.reloadAllExtensions();

         const error = results[0].reloadError;
         assert.instanceOf(error, WebExtError);

         const {sourceDir} = params.extensions[0];
         assert.ok(error && error.message.includes(
           `Error on extension loaded from ${sourceDir}: `
         ));

         sinon.assert.called(runnerInstance.remoteFirefox.reloadAddon);
       });

    it('cleans the android device state when the exit method is called',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();

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
           fakeADBUtils.amForceStopAPK,
           'emulator-1', params.firefoxApk
         );

         assert.isString(runnerInstance.selectedArtifactsDir);
         assert.equal(
           runnerInstance.selectedArtifactsDir,
           '/fake/artifacts-dir/'
         );

         sinon.assert.calledWithMatch(
           fakeADBUtils.clearArtifactsDir,
           'emulator-1'
         );
       });

    it('allows user to exit while waiting for the Android Firefox Debugger',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();

         fakeADBUtils.discoverRDPUnixSocket = sinon.spy(async () => {
           fakeStdin.emit('keypress', 'c', {name: 'c', ctrl: true});

           sinon.assert.calledOnce(fakeADBUtils.setUserAbortDiscovery);
           sinon.assert.calledWith(
             fakeADBUtils.setUserAbortDiscovery
           );

           // Reject the expected error, if all the assertion passes.
           throw new UsageError('fake user exit');
         });

         const fakeStdin = createFakeStdin();

         params.stdin = fakeStdin;

         let actualError;

         try {
           const runnerInstance = new FirefoxAndroidExtensionRunner(params);
           await runnerInstance.run();
         } catch (error) {
           actualError = error;
         } finally {
           fakeStdin.emit('keypress', 'c', {name: 'c', ctrl: true});
         }

         assert.instanceOf(actualError, UsageError);
         assert.match(
           actualError && actualError.message,
           /fake user exit/
         );
       });

    it('rejects on Android Firefox Debugger discovery timeouts',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();

         fakeADBUtils.discoverRDPUnixSocket = sinon.spy(() => {
           return Promise.reject(new WebExtError('fake timeout'));
         });

         params.firefoxAndroidTimeout = 0;

         let actualError;

         try {
           const runnerInstance = new FirefoxAndroidExtensionRunner(params);
           await runnerInstance.run();
         } catch (error) {
           actualError = error;
         }

         assert.instanceOf(actualError, WebExtError);
         assert.match(
           actualError && actualError.message,
           /fake timeout/
         );
       });

    it('rejects if an extension has never been uploaded on the device',
       async () => {
         const {params} = prepareSelectedDeviceAndAPKParams();

         const fakeFirefoxClient = params.firefoxClient;

         let actualError;
         let runnerInstance;

         params.firefoxClient = sinon.spy((firefoxClientParams) => {
           // Clear the map of uploaded extensions to fake a missing one.
           runnerInstance.adbExtensionsPathBySourceDir.clear();
           return fakeFirefoxClient(firefoxClientParams);
         });

         try {
           runnerInstance = new FirefoxAndroidExtensionRunner(params);
           await runnerInstance.run();
         } catch (error) {
           actualError = error;
         }

         assert.instanceOf(actualError, WebExtError);
         assert.match(
           actualError && actualError.message,
           /ADB extension path for "(.*)" was unexpectedly empty/
         );
       });

    it('calls the callback registered on cleanup when firefox closes',
       async () => {
         const {
           params, fakeADBUtils,
         } = prepareSelectedDeviceAndAPKParams();

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

         runnerInstance.remoteFirefox.client.emit('end');

         await waitFinalCallback;

         sinon.assert.calledWithMatch(
           fakeADBUtils.amForceStopAPK,
           'emulator-1', params.firefoxApk
         );

         sinon.assert.calledOnce(cleanupCallback);
         sinon.assert.calledOnce(anotherCallback);
       });

    it('raises an error when unable to find an android version number',
       async () => {
         async function expectInvalidVersionError(version: any) {
           const {
             params, fakeADBUtils,
           } = prepareSelectedDeviceAndAPKParams();

           fakeADBUtils.getAndroidVersionNumber = sinon.spy(() => {
             return version;
           });

           const runnerInstance = new FirefoxAndroidExtensionRunner(params);
           const promise = runnerInstance.run();

           const expectedMsg = `Invalid Android version: ${version}`;
           await assert.isRejected(promise, WebExtError);
           await assert.isRejected(promise, expectedMsg);
         }

         await expectInvalidVersionError(undefined);
         await expectInvalidVersionError(NaN);
       });

    it('does not check granted android permissions on Android <= 21',
       async () => {
         async function expectNoGrantedPermissionDiscovery(version) {
           const {
             params, fakeADBUtils,
           } = prepareSelectedDeviceAndAPKParams();

           fakeADBUtils.getAndroidVersionNumber = sinon.spy(() => {
             return Promise.resolve(version);
           });

           const runnerInstance = new FirefoxAndroidExtensionRunner(params);

           await runnerInstance.run();

           sinon.assert.calledWithMatch(
             fakeADBUtils.getAndroidVersionNumber,
             'emulator-1'
           );

           sinon.assert.notCalled(
             fakeADBUtils.ensureRequiredAPKRuntimePermissions
           );
         }

         // KitKat (Android 4.4).
         await expectNoGrantedPermissionDiscovery(19);
         await expectNoGrantedPermissionDiscovery(21);
         // Lollipop versions (Android 5.0 and 5.1).
         await expectNoGrantedPermissionDiscovery(22);
       });

    it('checks the granted android permissions on Android >= 23',
       async () => {
         async function testGrantedPermissionDiscovery(version) {
           const {
             params, fakeADBUtils,
           } = prepareSelectedDeviceAndAPKParams();

           fakeADBUtils.getAndroidVersionNumber = sinon.spy(() => {
             return Promise.resolve(version);
           });

           const runnerInstance = new FirefoxAndroidExtensionRunner(params);

           await runnerInstance.run();

           sinon.assert.calledWithMatch(
             fakeADBUtils.getAndroidVersionNumber,
             'emulator-1'
           );

           sinon.assert.calledWithMatch(
             fakeADBUtils.ensureRequiredAPKRuntimePermissions,
             'emulator-1', 'org.mozilla.firefox', [
               'android.permission.READ_EXTERNAL_STORAGE',
               'android.permission.WRITE_EXTERNAL_STORAGE',
             ]
           );

           sinon.assert.callOrder(
             fakeADBUtils.getAndroidVersionNumber,
             fakeADBUtils.ensureRequiredAPKRuntimePermissions
           );
         }

         // Marshmallow (Android 6.0)
         await testGrantedPermissionDiscovery(23);
         // Nougat versions (Android 7.0 and 7.1.1)
         await testGrantedPermissionDiscovery(24);
         await testGrantedPermissionDiscovery(25);
       });

    it('logs warnings on the unsupported CLI options', async () => {
      const params = prepareSelectedDeviceAndAPKParams();

      consoleStream.startCapturing();

      const optionsWarningTestCases = [
        {
          params: {profilePath: '/fake/dir'},
          expectedMessage: (
            /Android target does not support custom profile paths/
          ),
        },
        {
          params: {keepProfileChanges: true},
          expectedMessage: (
            /Android target does not support --keep-profile-changes/
          ),
        },
        {
          params: {browserConsole: true},
          expectedMessage: (
            /Android target does not support --browser-console/
          ),
        },
        {
          params: {preInstall: true},
          expectedMessage: (
            /Android target does not support --pre-install option/
          ),
        },
        {
          params: {startUrl: 'http://fake-start-url.org'},
          expectedMessage: (
            /Android target does not support --start-url option/
          ),
        },
      ];

      for (const testCase of optionsWarningTestCases) {
        // $FLOW_IGNORE: allow overriden params for testing purpose.
        new FirefoxAndroidExtensionRunner({ // eslint-disable-line no-new
          ...params,
          ...(testCase.params),
        });

        assert.match(
          consoleStream.capturedMessages[0],
          testCase.expectedMessage
        );

        consoleStream.flushCapturedLogs();
      }

      consoleStream.stopCapturing();
    });

  });

});

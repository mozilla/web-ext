/* @flow */

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
} from '../../../src/errors';
import {
  basicManifest,
  getFakeFirefox,
  getFakeRemoteFirefox,
//  makeSureItFails,
  StubChildProcess,
} from '../helpers';

// Fake result for client.installTemporaryAddon().then(installResult => ...)
const tempInstallResult = {
  addon: {id: 'some-addon@test-suite'},
};

function getFakeADBKit({adbClient = {}, adbUtil = {}}) {
  const fakeADBClient = {
    listDevices: sinon.spy(() => {
      return [];
    }),
    ...adbClient,
  };

  return {
    createClient: sinon.spy(() => {
      return fakeADBClient;
    }),
    fakeADBClient,
    util: {
      readAll: sinon.spy(() => ''),
      ...adbUtil,
    },
  };
}

type PrepareParams = {
  params?: Object,
  deps?: Object,
  fakeFirefoxApp?: Object,
  fakeRemoteFirefox?: Object,
  fakeADBClient?: Object,
  fakeADBUtil?: Object,
  debuggerPort?: number,
}

function prepareExtensionRunnerParams({
  debuggerPort,
  fakeFirefoxApp,
  fakeRemoteFirefox,
  fakeADBClient,
  fakeADBUtil,
  params,
}: PrepareParams = {}) {
  const remoteFirefox = getFakeRemoteFirefox({
    installTemporaryAddon: sinon.spy(
      () => Promise.resolve(tempInstallResult)
    ),
    ...fakeRemoteFirefox,
  });
  const firefoxProcess = new StubChildProcess();

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
      run: sinon.spy(() => {
        return Promise.resolve({
          debuggerPort,
          firefox: firefoxProcess,
        });
      }),
      ...fakeFirefoxApp,
    }, debuggerPort),
    adb: getFakeADBKit({adbClient: fakeADBClient, adbUtil: fakeADBUtil}),
    firefoxClient: () => {
      return Promise.resolve(remoteFirefox);
    },
    ...(params || {}),
  };

  return {
    remoteFirefox,
    firefoxProcess,
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

  });

});

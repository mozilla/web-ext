/* @flow */

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  default as createExtensionRunner,
  FirefoxDesktopExtensionRunner,
} from '../../../src/util/extension-runners/firefox-desktop';
import {
  getFakeFirefox,
  getFakeRemoteFirefox,
  makeSureItFails,
  StubChildProcess,
} from '../helpers';
import {
  onlyInstancesOf,
  WebExtError,
  RemoteTempInstallNotSupported,
} from '../../../src/errors';

// Fake result for client.installTemporaryAddon().then(installResult => ...)
const tempInstallResult = {
  addon: {id: 'some-addon@test-suite'},
};
// Fake missing addon id result for client.installTemporaryAddon
const tempInstallResultMissingAddonId = {
  addon: {id: null},
};

type PrepareParams = {
  params?: Object,
  deps?: Object,
  fakeFirefoxApp?: Object,
  fakeRemoteFirefox?: Object,
  debuggerPort?: number,
}

function prepareExtensionRunnerParams({
  params, deps, fakeFirefoxApp, fakeRemoteFirefox, debuggerPort,
}: PrepareParams = {}) {
  const remoteFirefox = getFakeRemoteFirefox({
    installTemporaryAddon: sinon.spy(
      () => Promise.resolve(tempInstallResult)
    ),
    ...fakeRemoteFirefox,
  });
  const firefoxProcess = new StubChildProcess();

  return {
    remoteFirefox,
    firefoxProcess,
    params: {
      extensions: [{
        sourceDir: '/fake/sourceDir',
        manifestData: {
          name: 'fake-addon',
          version: '0.1',
          applications: {
            gecko: {
              id: 'test@fake.id',
            },
          },
        },
      }],
      keepProfileChanges: false,
      browserConsole: false,
      startUrl: undefined,
      firefoxBinary: 'firefox',
      preInstall: false,
      noReload: false,
      ...(params || {}),
    },
    deps: {
      firefoxApp: getFakeFirefox({
        run: sinon.spy(() => {
          return Promise.resolve({
            debuggerPort,
            firefox: firefoxProcess,
          });
        }),
        ...fakeFirefoxApp,
      }, debuggerPort),
      firefoxClient: () => {
        return Promise.resolve(remoteFirefox);
      },
      ...(deps || {}),
    },
  };
}

describe('util/extension-runners/firefox-desktop', () => {

  describe('defines a default exported function', () => {

    it('creates instances of FirefoxDesktopExtensionRunner', () => {
      const {params, deps} = prepareExtensionRunnerParams();
      const extensionRunnerInstance = createExtensionRunner(params, deps);

      assert.ok(
        extensionRunnerInstance instanceof FirefoxDesktopExtensionRunner
      );

      if (extensionRunnerInstance instanceof FirefoxDesktopExtensionRunner) {
        assert.deepEqual(extensionRunnerInstance.params, params);
        assert.deepEqual(extensionRunnerInstance.deps, deps);
      }
    });

  });

  it('installs and runs the extension', async () => {
    const {params, deps, remoteFirefox} = prepareExtensionRunnerParams();

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    assert.ok(remoteFirefox.installTemporaryAddon.calledOnce);
    assert.equal(remoteFirefox.installTemporaryAddon.firstCall.args[0],
                 params.extensions[0].sourceDir);
    assert.ok(deps.firefoxApp.run.calledOnce);
    assert.ok(deps.firefoxApp.run.firstCall.args[0], params.profilePath);
  });

  it('runs extension in correct port', async () => {
    const {params, deps} = prepareExtensionRunnerParams({
      debuggerPort: 6008,
    });

    sinon.spy(deps, 'firefoxClient');

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    assert.ok(deps.firefoxApp.run.calledOnce);
    assert.ok(deps.firefoxClient.calledOnce);
    assert.equal(deps.firefoxClient.firstCall.args[0].port, 6008);
  });

  it('suggests --pre-install when remote install not supported', async () => {
    const {params, deps, remoteFirefox} = prepareExtensionRunnerParams({
      fakeRemoteFirefox: {
        // Simulate an older Firefox that will throw this error.
        installTemporaryAddon: sinon.spy(
          () => Promise.reject(new RemoteTempInstallNotSupported(''))
        ),
      },
    });

    sinon.spy(deps, 'firefoxClient');

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    return extensionRunnerInstance.run()
      .then(makeSureItFails())
      .catch(onlyInstancesOf(WebExtError, (error) => {
        assert.equal(remoteFirefox.installTemporaryAddon.called, true);
        assert.match(error.message, /use --pre-install/);
      }));
  });

  async function testBinaryArgs(extensionRunnerParams, expectedBinaryArgs) {
    const {params, deps} = prepareExtensionRunnerParams({
      params: {
        ...extensionRunnerParams,
      },
    });

    sinon.spy(deps, 'firefoxClient');

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    assert.ok(deps.firefoxApp.run.calledOnce);
    assert.deepEqual(deps.firefoxApp.run.firstCall.args[1].binaryArgs,
                     expectedBinaryArgs);
  }

  it('passes -jsconsole when --browser-console is specified', async () => {
    await testBinaryArgs({
      browserConsole: true,
    }, [
      '-jsconsole',
    ]);
  });

  it('passes single url parameter to Firefox when specified', async () => {
    await testBinaryArgs({
      startUrl: 'url1',
    }, [
      '--url', 'url1',
    ]);
  });

  it('passes multiple url parameters to Firefox when specified', async () => {
    await testBinaryArgs({
      startUrl: ['url1', 'url2'],
    }, [
      '--url', 'url1', '--url', 'url2',
    ]);
  });

  it('passes a custom Firefox profile when specified', async () => {
    const {params, deps} = prepareExtensionRunnerParams({
      params: {
        profilePath: '/path/to/profile',
      },
    });

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    assert.equal(deps.firefoxApp.createProfile.called, false);
    assert.ok(deps.firefoxApp.copyProfile.calledOnce);
    assert.equal(deps.firefoxApp.copyProfile.firstCall.args[0],
                 params.profilePath);
  });

  it('keeps changes in custom profile when specified', async () => {
    const {params, deps} = prepareExtensionRunnerParams({
      params: {
        profilePath: '/path/to/profile',
        keepProfileChanges: true,
      },
    });

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    assert.equal(deps.firefoxApp.createProfile.called, false);
    assert.ok(deps.firefoxApp.useProfile.calledOnce);
    assert.equal(deps.firefoxApp.useProfile.firstCall.args[0],
                 params.profilePath);
  });

  it('can pre-install into the profile before startup', async () => {
    const fakeProfile = {};
    const {params, deps, remoteFirefox} = prepareExtensionRunnerParams({
      fakeFirefoxApp: {
        copyProfile: () => fakeProfile,
      },
      params: {
        preInstall: true,
      },
    });


    sinon.spy(deps, 'firefoxClient');

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    // Install the extension without connecting to the RDP server.
    assert.equal(deps.firefoxClient.called, false);
    assert.equal(remoteFirefox.installTemporaryAddon.called, false);
    assert.equal(deps.firefoxApp.installExtension.called, true);

    const install = deps.firefoxApp.installExtension.firstCall.args[0];
    const {manifestData, sourceDir} = params.extensions[0];
    assert.equal(install.asProxy, true);
    assert.equal(install.manifestData.applications.gecko.id,
                 manifestData.applications.gecko.id);
    assert.deepEqual(install.profile, fakeProfile);
    // This needs to be the source of the extension.
    assert.equal(install.extensionPath, sourceDir);
  });

  it('raise an error on addonId missing from installTemporaryAddon result',
     async () => {
       const {params, deps} = prepareExtensionRunnerParams({
         fakeRemoteFirefox: {
           installTemporaryAddon: sinon.spy(
             () => Promise.resolve(tempInstallResultMissingAddonId)
           ),
         },
       });

       const extensionRunnerInstance = createExtensionRunner(params, deps);
       await extensionRunnerInstance.run()
         .catch((error) => error)
         .then((error) => {
           assert.equal(
             error instanceof WebExtError,
             true
           );
           assert.equal(
             error.message,
             'Unexpected missing addonId in the installAsTemporaryAddon result'
           );
         });
     });

  it('calls the callback registered on cleanup when firefox closes',
     async () => {
       const {params, deps, firefoxProcess} = prepareExtensionRunnerParams();

       const extensionRunnerInstance = createExtensionRunner(params, deps);
       const cleanupCallback = sinon.spy(() => {
         throw new Error('cleanup callback error');
       });
       const anotherCallback = sinon.spy();

       extensionRunnerInstance.registerCleanup(cleanupCallback);
       extensionRunnerInstance.registerCleanup(anotherCallback);

       await extensionRunnerInstance.run();

       firefoxProcess.emit('close');
       await Promise.resolve();
       assert.equal(cleanupCallback.calledOnce, true);
       assert.equal(anotherCallback.calledOnce, true);
     });

  it('kills Firefox when the exit method is called', async () => {
    const {params, deps, firefoxProcess} = prepareExtensionRunnerParams();

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    const cleanupCallback = sinon.spy(() => {
      throw new Error('cleanup callback error');
    });
    const anotherCallback = sinon.spy();

    extensionRunnerInstance.registerCleanup(cleanupCallback);
    extensionRunnerInstance.registerCleanup(anotherCallback);

    await extensionRunnerInstance.run();
    await extensionRunnerInstance.exit();

    assert.ok(firefoxProcess.kill.calledOnce);
  });

  it('raises an Error when exit method is called on a non-started runner',
     async () => {
       const {params, deps} = prepareExtensionRunnerParams();

       const extensionRunnerInstance = createExtensionRunner(params, deps);

       await extensionRunnerInstance.exit()
         .catch((error) => error)
         .then((error) => {
           assert.equal(
             error instanceof WebExtError,
             true
           );
           assert.equal(
             error.message,
             'No firefox instance is currently running'
           );
         });
     });

  it('reloads all reloadable extensions when reloadAllExtensions is called',
     async () => {
       const {params, deps, remoteFirefox} = prepareExtensionRunnerParams();

       const extensionRunnerInstance = createExtensionRunner(params, deps);
       await extensionRunnerInstance.run();

       await extensionRunnerInstance.reloadAllExtensions();

       assert.ok(remoteFirefox.reloadAddon.calledOnce);
     });

  it('reloads an extension by sourceDir', async () => {
    const {params, deps, remoteFirefox} = prepareExtensionRunnerParams();

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    await extensionRunnerInstance.reloadExtensionBySourceDir(
      params.extensions[0].sourceDir,
    );

    assert.ok(remoteFirefox.reloadAddon.calledOnce);
  });

  it('raises an error when the extension is not reloadable', async () => {
    const {params, deps, remoteFirefox} = prepareExtensionRunnerParams();

    const extensionRunnerInstance = createExtensionRunner(params, deps);
    await extensionRunnerInstance.run();

    await extensionRunnerInstance.reloadExtensionBySourceDir(
      '/non-existent/source-dir'
    )
      .catch((error) => error)
      .then((error) => {
        assert.equal(
          error instanceof WebExtError,
          true
        );
        assert.equal(
          error.message,
          'Extension not reloadable'
        );
      });

    assert.equal(remoteFirefox.reloadAddon.called, false);
  });

  it('rejects an AllExtensionsReloadError if any extension fails to reload',
     async () => {
       const {params, deps, remoteFirefox} = prepareExtensionRunnerParams({
         fakeRemoteFirefox: {
           reloadAddon: sinon.spy(
             () => Promise.reject(Error('Reload failure'))
           ),
         },
       });

       const extensionRunnerInstance = createExtensionRunner(params, deps);
       await extensionRunnerInstance.run();

       await extensionRunnerInstance.reloadAllExtensions()
         .catch((error) => error)
         .then((error) => {
           assert.equal(
             error instanceof WebExtError,
             true
           );
           assert.match(
             error.message,
               /Reload failure on:/
           );
         });

       assert.equal(remoteFirefox.reloadAddon.called, true);
     });

});

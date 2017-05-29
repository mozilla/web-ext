/* @flow */

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  default as createExtensionRunner,
  MultipleTargetsExtensionRunner,
} from '../../../src/util/extension-runners';
import {
  FirefoxDesktopExtensionRunner,
} from '../../../src/util/extension-runners/firefox-desktop';
import {
  FakeExtensionRunner,
  getFakeFirefox,
  getFakeRemoteFirefox,
} from '../helpers';

function prepareExtensionRunnerParams() {
  return {
    params: {
      extensions: [{
        sourceDir: '/fake/sourceDir',
        manifestData: {
          name: 'fake-addon',
          version: '0.1',
        },
      }],
      keepProfileChanges: false,
      startUrl: [],
      browserConsole: false,
      firefoxBinary: 'firefox',
      preInstall: false,
      noReload: false,
      targets: ['firefox-desktop'],
    },
    deps: {
      firefoxApp: getFakeFirefox(),
      firefoxClient: () => {
        return Promise.resolve(getFakeRemoteFirefox());
      },
    },
  };
}

describe('util/extension-runners', () => {

  describe('defines a default exported function', () => {

    it('creates instances of MultipleTargetsExtensionRunner', () => {
      const {params, deps} = prepareExtensionRunnerParams();

      const fakeExtensionRunner = new FakeExtensionRunner();

      const allDeps = {
        ...deps,
        extensionRunnerFactories: {
          'firefox-desktop': sinon.spy(() => fakeExtensionRunner),
        },
      };
      const runnerInstance = createExtensionRunner(params, allDeps);

      assert.ok(
        runnerInstance instanceof MultipleTargetsExtensionRunner
      );

      if (runnerInstance instanceof MultipleTargetsExtensionRunner) {
        assert.deepEqual(runnerInstance.params, params);
        assert.deepEqual(runnerInstance.deps, allDeps);
        assert.equal(runnerInstance.extensionRunners.length, 1);
        assert.equal(runnerInstance.extensionRunners[0],
                     fakeExtensionRunner);
      }
    });
  });

  it('creates a firefox-desktop FirefoxDesktopExtensionRunner by default',
     () => {
       const {params, deps} = prepareExtensionRunnerParams();
       const runnerInstance = createExtensionRunner(params, deps);

       if (runnerInstance instanceof MultipleTargetsExtensionRunner) {
         assert.equal(runnerInstance.extensionRunners.length, 1);
         const runner = runnerInstance.extensionRunners[0];
         assert.ok(runner instanceof FirefoxDesktopExtensionRunner);
       }
     });

  it('creates a firefox-desktop ExtensionRunner when not specified', () => {
    const {params, deps} = prepareExtensionRunnerParams();

    const fakeExtensionRunner = new FakeExtensionRunner();

    const allDeps = {
      ...deps,
      extensionRunnerFactories: {
        'firefox-desktop': sinon.spy(() => fakeExtensionRunner),
      },
    };

    // Remove the default targets.
    params.targets = [];

    const runnerInstance = createExtensionRunner(params, allDeps);

    if (runnerInstance instanceof MultipleTargetsExtensionRunner) {
      assert.equal(runnerInstance.extensionRunners.length, 1);
      assert.equal(runnerInstance.extensionRunners[0],
                   fakeExtensionRunner);
    }
  });

  it('does not fail when one of the targets has been found', () => {
    const {params, deps} = prepareExtensionRunnerParams();

    const fakeExtensionRunner = new FakeExtensionRunner();

    const allDeps = {
      ...deps,
      extensionRunnerFactories: {
        'firefox-desktop': sinon.spy(() => fakeExtensionRunner),
      },
    };

    // Override the default targets.
    params.targets = ['non-existent-runner', 'firefox-desktop'];

    const runnerInstance = createExtensionRunner(params, allDeps);

    if (runnerInstance instanceof MultipleTargetsExtensionRunner) {
      assert.equal(runnerInstance.extensionRunners.length, 1);
      assert.equal(runnerInstance.extensionRunners[0],
                   fakeExtensionRunner);
    } else {
      throw Error('Unexpected extension runner type');
    }
  });

  it('fails when none of the target ExtensionRunner has been found', () => {
    const {params, deps} = prepareExtensionRunnerParams();

    // Override the default targets.
    params.targets = ['non-existent-runner'];

    assert.throws(() => {
      createExtensionRunner(params, deps);
    }, /None of the requested extension runner targets is available/);
  });

  function prepareMultipleTargetsTest() {
    const {params, deps} = prepareExtensionRunnerParams();

    const fakeExtensionRunner = new FakeExtensionRunner();
    const anotherFakeExtensionRunner = new FakeExtensionRunner();

    const allDeps = {
      ...deps,
      extensionRunnerFactories: {
        'firefox-desktop': sinon.spy(() => fakeExtensionRunner),
        'another-runner': sinon.spy(() => anotherFakeExtensionRunner),
      },
    };

    // Override the default targets.
    params.targets = ['another-runner', 'firefox-desktop'];

    return {
      fakeExtensionRunner,
      anotherFakeExtensionRunner,
      params,
      deps: allDeps,
    };
  }

  it('calls the "run" method on all the created IExtensionRunner', async () => {
    const {
      params, deps, fakeExtensionRunner, anotherFakeExtensionRunner,
    } = prepareMultipleTargetsTest();

    sinon.spy(fakeExtensionRunner, 'run');
    sinon.spy(anotherFakeExtensionRunner, 'run');

    const runnerInstance = createExtensionRunner(params, deps);

    if (!(runnerInstance instanceof MultipleTargetsExtensionRunner)) {
      throw Error('Unexpected extension runner type');
    }

    await runnerInstance.run();

    assert.ok(fakeExtensionRunner.run.calledOnce);
    assert.ok(anotherFakeExtensionRunner.run.calledOnce);
  });

  it('calls the "reloadAllExtensions" on all the created runners',
     async () => {
       const {
         params, deps, fakeExtensionRunner, anotherFakeExtensionRunner,
       } = prepareMultipleTargetsTest();

       sinon.spy(fakeExtensionRunner, 'reloadAllExtensions');
       sinon.spy(anotherFakeExtensionRunner, 'reloadAllExtensions');

       const runnerInstance = createExtensionRunner(params, deps);

       if (!(runnerInstance instanceof MultipleTargetsExtensionRunner)) {
         throw Error('Unexpected extension runner type');
       }

       await runnerInstance.reloadAllExtensions();

       assert.ok(fakeExtensionRunner.reloadAllExtensions.calledOnce);
       assert.ok(anotherFakeExtensionRunner.reloadAllExtensions.calledOnce);
     });

  it('calls the "reloadExtensionBySourceDir" on all the created runners',
     async () => {
       const {
         params, deps, fakeExtensionRunner, anotherFakeExtensionRunner,
       } = prepareMultipleTargetsTest();

       sinon.spy(fakeExtensionRunner, 'reloadExtensionBySourceDir');
       sinon.spy(anotherFakeExtensionRunner, 'reloadExtensionBySourceDir');

       const runnerInstance = createExtensionRunner(params, deps);

       if (!(runnerInstance instanceof MultipleTargetsExtensionRunner)) {
         throw Error('Unexpected extension runner type');
       }

       await runnerInstance.reloadExtensionBySourceDir(
         '/fake/source/dir'
       );

       assert.ok(fakeExtensionRunner.reloadExtensionBySourceDir.calledOnce);
       assert.ok(
         anotherFakeExtensionRunner.reloadExtensionBySourceDir.calledOnce
       );

       assert.equal(
         fakeExtensionRunner.reloadExtensionBySourceDir.firstCall.args[0],
         '/fake/source/dir'
       );
       assert.equal(
         anotherFakeExtensionRunner.reloadExtensionBySourceDir
           .firstCall.args[0],
         '/fake/source/dir'
       );
     });

  it('calls exit on all the created IExtensionRunner', async () => {
    const {
      params, deps, fakeExtensionRunner, anotherFakeExtensionRunner,
    } = prepareMultipleTargetsTest();

    sinon.spy(fakeExtensionRunner, 'exit');
    sinon.spy(anotherFakeExtensionRunner, 'exit');

    const runnerInstance = createExtensionRunner(params, deps);

    if (!(runnerInstance instanceof MultipleTargetsExtensionRunner)) {
      throw Error('Unexpected extension runner type');
    }

    await runnerInstance.exit();

    assert.ok(fakeExtensionRunner.exit.calledOnce);
    assert.ok(anotherFakeExtensionRunner.exit.calledOnce);
  });

  describe('registerCleanup', () => {

    it('calls its callbacks once all the runner callbacks have been called',
       async () => {
         const {
           params, deps, fakeExtensionRunner, anotherFakeExtensionRunner,
         } = prepareMultipleTargetsTest();

         sinon.spy(fakeExtensionRunner, 'registerCleanup');
         sinon.spy(anotherFakeExtensionRunner, 'registerCleanup');

         const runnerInstance = createExtensionRunner(params, deps);

         if (!(runnerInstance instanceof MultipleTargetsExtensionRunner)) {
           throw Error('Unexpected extension runner type');
         }

         const waitRegisterCleanup = new Promise((resolve) => {
           runnerInstance.registerCleanup(resolve);
         });

         assert.ok(fakeExtensionRunner.registerCleanup.calledOnce);
         assert.ok(anotherFakeExtensionRunner.registerCleanup.calledOnce);

         fakeExtensionRunner.registerCleanup.firstCall.args[0]();
         anotherFakeExtensionRunner.registerCleanup.firstCall.args[0]();

         await waitRegisterCleanup;
       });

  });

});

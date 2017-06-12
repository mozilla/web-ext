/* @flow */

import stream from 'stream';
import tty from 'tty';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  defaultWatcherCreator,
  defaultReloadStrategy,
  MultiExtensionRunner,
} from '../../../src/extension-runners';
import {
  FakeExtensionRunner,
  getFakeFirefox,
  getFakeRemoteFirefox,
} from '../helpers';
import type {
  IExtensionRunner, // eslint-disable-line import/named
} from '../../../src/extension-runners/base';

function createFakeExtensionRunner(
  {
    params = {}, overriddenMethods = {},
  }: {params?: Object, overriddenMethods?: Object}
): IExtensionRunner {
  const runner = new FakeExtensionRunner(params);

  for (const [fnName, fn] of Object.entries(overriddenMethods)) {
    sinon.stub(runner, fnName).callsFake(fn);
  }

  return runner;
}

function prepareExtensionRunnerParams(params) {
  return {
    runners: [new FakeExtensionRunner(), new FakeExtensionRunner()],
    firefoxApp: getFakeFirefox(),
    firefoxClient: () => {
      return Promise.resolve(getFakeRemoteFirefox());
    },
    desktopNotifications: sinon.spy(() => {}),
    ...params,
  };
}

describe('util/extension-runners', () => {

  describe('MultiExtensionRunner', () => {

    it('calls the "run" method on all the created IExtensionRunner',
      async () => {
        const params = prepareExtensionRunnerParams();
        const [
          fakeExtensionRunner, anotherFakeExtensionRunner,
        ] = params.runners;

        sinon.spy(fakeExtensionRunner, 'run');
        sinon.spy(anotherFakeExtensionRunner, 'run');

        const runnerInstance = new MultiExtensionRunner(params);

        assert.equal(runnerInstance.getName(), 'Multi Extension Runner');

        await runnerInstance.run();

        assert.ok(fakeExtensionRunner.run.calledOnce);
        assert.ok(anotherFakeExtensionRunner.run.calledOnce);
      });

    it('calls the "reloadAllExtensions" on all the created runners',
       async () => {
         const params = prepareExtensionRunnerParams();
         const [
           fakeExtensionRunner, anotherFakeExtensionRunner,
         ] = params.runners;

         sinon.spy(fakeExtensionRunner, 'reloadAllExtensions');
         sinon.spy(anotherFakeExtensionRunner, 'reloadAllExtensions');

         const runnerInstance = new MultiExtensionRunner(params);

         await runnerInstance.reloadAllExtensions();

         assert.ok(fakeExtensionRunner.reloadAllExtensions.calledOnce);
         assert.ok(anotherFakeExtensionRunner.reloadAllExtensions.calledOnce);
       });

    it('calls the "reloadExtensionBySourceDir" on all the created runners',
       async () => {
         const params = prepareExtensionRunnerParams();
         const [
           fakeExtensionRunner, anotherFakeExtensionRunner,
         ] = params.runners;

         sinon.spy(fakeExtensionRunner, 'reloadExtensionBySourceDir');
         sinon.spy(anotherFakeExtensionRunner, 'reloadExtensionBySourceDir');

         const runnerInstance = new MultiExtensionRunner(params);

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
      const params = prepareExtensionRunnerParams();
      const [
        fakeExtensionRunner, anotherFakeExtensionRunner,
      ] = params.runners;

      sinon.spy(fakeExtensionRunner, 'exit');
      sinon.spy(anotherFakeExtensionRunner, 'exit');

      const runnerInstance = new MultiExtensionRunner(params);

      await runnerInstance.exit();

      assert.ok(fakeExtensionRunner.exit.calledOnce);
      assert.ok(anotherFakeExtensionRunner.exit.calledOnce);
    });

    it('shows a desktop notification on errors while reloading all extensions',
      async () => {
        const params = prepareExtensionRunnerParams();
        const fakeExtensionRunner = createFakeExtensionRunner({
          overriddenMethods: {
            getName: () => 'fakeExtensionRunner',
            reloadAllExtensions: () => {
              return Promise.reject(new Error('reload error 1'));
            },
          },
        });
        const anotherFakeExtensionRunner = createFakeExtensionRunner({
          getName: () => 'anotherFakeExtensionRunner',
          overriddenMethods: {
            reloadAllExtensions: () => {
              return Promise.reject(new Error('reload error 2'));
            },
          },
        });

        params.runners = [fakeExtensionRunner, anotherFakeExtensionRunner];

        const runnerInstance = new MultiExtensionRunner(params);

        await runnerInstance.reloadAllExtensions();

        assert.ok(fakeExtensionRunner.reloadAllExtensions.calledOnce);
        assert.ok(anotherFakeExtensionRunner.reloadAllExtensions.calledOnce);
        assert.equal(params.desktopNotifications.callCount, 2);

        assert.match(params.desktopNotifications.firstCall.args[0].title,
                     /web-ext run: extension reload error/);
        assert.match(params.desktopNotifications.firstCall.args[0].message,
                    /on "fakeExtensionRunner" - reload error 1/);
      });

    it('shows a desktop notification on errors while reloading an extension',
      async () => {
        const params = prepareExtensionRunnerParams();
        const fakeExtensionRunner = createFakeExtensionRunner({
          overriddenMethods: {
            getName: () => 'fakeExtensionRunner',
            reloadExtensionBySourceDir: () => {
              return Promise.reject(new Error('reload error 1'));
            },
          },
        });
        const anotherFakeExtensionRunner = createFakeExtensionRunner({
          overriddenMethods: {
            reloadExtensionBySourceDir: () => Promise.resolve(),
            getName: () => 'anotherFakeExtensionRunner',
          },
        });

        params.runners = [fakeExtensionRunner, anotherFakeExtensionRunner];

        const runnerInstance = new MultiExtensionRunner(params);
        const sourceDir = '/fake/sourceDir';
        const res = await runnerInstance.reloadExtensionBySourceDir(sourceDir);
        const errors = res.filter((r) => r.reloadError);

        assert.equal(res.length, 2);
        assert.equal(errors.length, 1);

        assert.ok(fakeExtensionRunner.reloadExtensionBySourceDir.calledOnce);
        assert.ok(
          anotherFakeExtensionRunner.reloadExtensionBySourceDir.calledOnce
        );
        assert.equal(params.desktopNotifications.callCount, 1);

        assert.match(params.desktopNotifications.firstCall.args[0].title,
                     /web-ext run: extension reload error/);
        assert.match(
          params.desktopNotifications.firstCall.args[0].message,
          /"\/fake\/sourceDir" on "fakeExtensionRunner" - reload error 1/
        );
      });

    describe('registerCleanup', () => {

      it('calls its callbacks once all the runner callbacks have been called',
         async () => {
           const params = prepareExtensionRunnerParams();
           const [
             fakeExtensionRunner, anotherFakeExtensionRunner,
           ] = params.runners;

           sinon.spy(fakeExtensionRunner, 'registerCleanup');
           sinon.spy(anotherFakeExtensionRunner, 'registerCleanup');

           const runnerInstance = new MultiExtensionRunner(params);

           const waitRegisterCleanup = new Promise((resolve) => {
             runnerInstance.registerCleanup(resolve);
           });

           assert.ok(fakeExtensionRunner.registerCleanup.calledOnce);
           assert.ok(anotherFakeExtensionRunner.registerCleanup.calledOnce);

           fakeExtensionRunner.registerCleanup.firstCall.args[0]();

           const checkIncompleteCleanup = await Promise.race([
             waitRegisterCleanup,
             new Promise((resolve) => {
               setTimeout(() => {
                 resolve('waitRegisterCleanup should not be resolved yet');
               }, 300);
             }),
           ]);

           assert.equal(checkIncompleteCleanup,
                        'waitRegisterCleanup should not be resolved yet');

           anotherFakeExtensionRunner.registerCleanup.firstCall.args[0]();

           await waitRegisterCleanup;
         });

    });

  });

  describe('defaultWatcherCreator', () => {

    function prepare() {
      const config = {
        sourceDir: '/path/to/extension/source/',
        artifactsDir: '/path/to/web-ext-artifacts',
        onSourceChange: sinon.spy(() => {}),
        ignoreFiles: ['path/to/file', 'path/to/file2'],
        reloadExtension: sinon.spy(() => Promise.resolve()),
      };
      return {
        config,
        createWatcher: (customConfig = {}) => {
          return defaultWatcherCreator({...config, ...customConfig});
        },
      };
    }

    it('configures a source watcher', () => {
      const {config, createWatcher} = prepare();
      createWatcher();
      assert.equal(config.onSourceChange.called, true);
      const callArgs = config.onSourceChange.firstCall.args[0];
      assert.equal(callArgs.sourceDir, config.sourceDir);
      assert.equal(callArgs.artifactsDir, config.artifactsDir);
      assert.typeOf(callArgs.onChange, 'function');
    });

    it('configures a run command with the expected fileFilter', () => {
      const fileFilter = {wantFile: sinon.spy()};
      const createFileFilter = sinon.spy(() => fileFilter);
      const {config, createWatcher} = prepare();
      createWatcher({createFileFilter});
      assert.ok(createFileFilter.called);
      assert.deepEqual(createFileFilter.firstCall.args[0], {
        sourceDir: config.sourceDir,
        artifactsDir: config.artifactsDir,
        ignoreFiles: config.ignoreFiles,
      });
      const {shouldWatchFile} = config.onSourceChange.firstCall.args[0];
      shouldWatchFile('path/to/file');
      assert.ok(fileFilter.wantFile.called);
      assert.equal(fileFilter.wantFile.firstCall.args[0], 'path/to/file');
    });

    it('returns a watcher', () => {
      const watcher = {};
      const onSourceChange = sinon.spy(() => watcher);
      const createdWatcher = prepare().createWatcher({onSourceChange});
      assert.equal(createdWatcher, watcher);
    });

    it('reloads the extension', async () => {
      const {config, createWatcher} = prepare();
      createWatcher();

      const callArgs = config.onSourceChange.firstCall.args[0];
      assert.typeOf(callArgs.onChange, 'function');
      // Simulate executing the handler when a source file changes.
      await callArgs.onChange();
      assert.equal(config.reloadExtension.called, true);
      const reloadArgs = config.reloadExtension.firstCall.args;
      assert.equal(reloadArgs[0], config.sourceDir);
    });

  });

  describe('defaultReloadStrategy', () => {

    function prepare({stubExtensionRunner} = {}) {
      const watcher = {
        close: sinon.spy(() => {}),
      };
      const extensionRunner = createFakeExtensionRunner({
        overriddenMethods: stubExtensionRunner,
      });
      const args = {
        extensionRunner,
        sourceDir: '/path/to/extension/source',
        artifactsDir: '/path/to/web-ext-artifacts/',
        ignoreFiles: ['first/file', 'second/file'],
      };
      const options = {
        createWatcher: sinon.spy(() => watcher),
        stdin: new stream.Readable(),
      };
      return {
        ...args,
        ...options,
        watcher,
        extensionRunner,
        reloadStrategy: async (argOverride = {}, optOverride = {}) => {
          return defaultReloadStrategy(
            {...args, ...argOverride},
            {...options, ...optOverride});
        },
      };
    }

    it('configures a watcher', () => {
      const {
        createWatcher, reloadStrategy,
        ...sentArgs
      } = prepare();

      reloadStrategy();
      assert.ok(createWatcher.called);
      const receivedArgs = createWatcher.firstCall.args[0];
      assert.equal(receivedArgs.client, sentArgs.client);
      assert.equal(receivedArgs.sourceDir, sentArgs.sourceDir);
      assert.equal(receivedArgs.artifactsDir, sentArgs.artifactsDir);
      assert.deepEqual(receivedArgs.ignoreFiles, sentArgs.ignoreFiles);
    });

    it('configure the watcher to reload an extension by sourceDir', () => {
      const {
        extensionRunner, createWatcher, reloadStrategy,
      } = prepare({
        stubExtensionRunner: {
          reloadExtensionBySourceDir() {},
        },
      });

      reloadStrategy();

      assert.ok(createWatcher.calledOnce);

      const {reloadExtension} = createWatcher.firstCall.args[0];
      assert.equal(typeof reloadExtension, 'function');

      const sourceDir = '/fake/sourceDir';
      reloadExtension(sourceDir);

      const {reloadExtensionBySourceDir} = extensionRunner;
      assert.ok(reloadExtensionBySourceDir.calledOnce);
      assert.equal(reloadExtensionBySourceDir.firstCall.args[0], sourceDir);
    });

    it('cleans up when the extension runner closes', () => {
      const {
        extensionRunner, watcher, reloadStrategy, stdin,
      } = prepare({
        stubExtensionRunner: {
          registerCleanup() {},
        },
      });

      sinon.spy(stdin, 'pause');

      reloadStrategy();

      assert.ok(extensionRunner.registerCleanup.called);
      assert.ok(extensionRunner.registerCleanup.calledOnce);

      const registeredCb = extensionRunner.registerCleanup.firstCall.args[0];

      assert.equal(typeof registeredCb, 'function');

      registeredCb();

      assert.equal(watcher.close.called, true);
      assert.ok(stdin.pause.called);
    });

    it('can reload when user presses R in shell console', async () => {
      const {extensionRunner, reloadStrategy} = prepare();

      const fakeStdin = new tty.ReadStream();
      sinon.spy(fakeStdin, 'setRawMode');
      sinon.spy(extensionRunner, 'reloadAllExtensions');

      await reloadStrategy({}, {stdin: fakeStdin});
      fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});

      // Wait for one tick.
      await Promise.resolve();

      assert.ok(fakeStdin.setRawMode.called);
      assert.ok(extensionRunner.reloadAllExtensions.called);
    });

    it('can still reload when user presses R after a reload error',
      async () => {
        const {extensionRunner, reloadStrategy} = prepare();

        const fakeStdin = new tty.ReadStream();
        sinon.spy(fakeStdin, 'setRawMode');

        // $FLOW_FIXME: override method with a sinon spy.
        extensionRunner.reloadAllExtensions = sinon.spy(
          () => Promise.reject(Error('fake reload error'))
        );

        reloadStrategy({}, {stdin: fakeStdin});
        // Wait for one tick for reloadStrategy's keypress processing loop
        // to be ready.
        await Promise.resolve();

        fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});
        // Wait for one tick to give reloadStrategy the chance to handle
        // the keypress event.
        await Promise.resolve();
        assert.ok(fakeStdin.setRawMode.called);
        assert.equal(extensionRunner.reloadAllExtensions.callCount, 1);
        fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});
        await Promise.resolve();
        assert.equal(extensionRunner.reloadAllExtensions.callCount, 2);

        // Exit the keypress processing loop.
        fakeStdin.emit('keypress', 'c', {name: 'c', ctrl: true});
      });

    it('shuts down firefox on user request (CTRL+C in shell console)',
      async () => {
        const {extensionRunner, reloadStrategy} = prepare({
          stubExtensionRunner: {
            async exit() {},
          },
        });
        const fakeStdin = new tty.ReadStream();

        await reloadStrategy({}, {stdin: fakeStdin});

        fakeStdin.emit('keypress', 'c', {name: 'c', ctrl: true});

        // Wait for one tick.
        await Promise.resolve();

        assert.ok(extensionRunner.exit.called);
      });

  });

});

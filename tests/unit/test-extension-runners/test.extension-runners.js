/* @flow */
import stream from 'stream';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  createExtensionRunner,
  defaultWatcherCreator,
  defaultReloadStrategy,
  MultiExtensionRunner,
} from '../../../src/extension-runners';
import {
  createFakeStdin,
  FakeExtensionRunner,
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
    desktopNotifications: sinon.spy(() => {}),
    ...params,
  };
}

function exitKeypressLoop(stdin) {
  try {
    // Ensure that the keypress processing loop (defined in defaultReloadStrategy)
    // is exited.
    stdin.emit('keypress', 'c', {name: 'c', ctrl: true});
  } catch (error) {
    // NOTE: exceptions raised by this helper are logged on the console
    // and ignored (so that we don't hide an exception raised by a try block
    // if this helper is used in a finally block).

    // eslint-disable-next-line no-console
    console.error('ERROR in exitKeypressLoop test helper - ' +
                  'Unexpected exception while exiting the keypress loop',
                  error);
  }
}

describe('util/extension-runners', () => {
  describe('createExtensionRunner', () => {
    it('requires a valid target', async () => {
      // $FlowIgnore: Want to pass invalid argument and check the error.
      const promise = createExtensionRunner({});
      await assert.isRejected(promise, /Unknown target: "undefined"/);
    });
  });

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

         sinon.assert.calledOnce(fakeExtensionRunner.run);
         sinon.assert.calledOnce(anotherFakeExtensionRunner.run);
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

         sinon.assert.calledOnce(fakeExtensionRunner.reloadAllExtensions);
         sinon.assert.calledOnce(
           anotherFakeExtensionRunner.reloadAllExtensions
         );
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

         sinon.assert.calledOnce(
           fakeExtensionRunner.reloadExtensionBySourceDir
         );
         sinon.assert.calledOnce(
           anotherFakeExtensionRunner.reloadExtensionBySourceDir
         );

         sinon.assert.calledWith(
           fakeExtensionRunner.reloadExtensionBySourceDir,
           sinon.match('/fake/source/dir')
         );
         sinon.assert.calledWith(
           anotherFakeExtensionRunner.reloadExtensionBySourceDir,
           sinon.match('/fake/source/dir')
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

      sinon.assert.calledOnce(fakeExtensionRunner.exit);
      sinon.assert.calledOnce(anotherFakeExtensionRunner.exit);
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

         sinon.assert.calledOnce(fakeExtensionRunner.reloadAllExtensions);
         sinon.assert.calledOnce(
           anotherFakeExtensionRunner.reloadAllExtensions
         );
         sinon.assert.callCount(params.desktopNotifications, 2);
         sinon.assert.calledWith(
           params.desktopNotifications,
           sinon.match({
             title: sinon.match(/web-ext run: extension reload error/),
             message: sinon.match(/on "fakeExtensionRunner" - reload error 1/),
           })
         );
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

         sinon.assert.calledOnce(
           fakeExtensionRunner.reloadExtensionBySourceDir
         );
         sinon.assert.calledOnce(
           anotherFakeExtensionRunner.reloadExtensionBySourceDir
         );
         sinon.assert.calledOnce(params.desktopNotifications);

         sinon.assert.calledWith(
           params.desktopNotifications,
           sinon.match({
             title: sinon.match(/web-ext run: extension reload error/),
             message: sinon.match(
               /"\/fake\/sourceDir" on "fakeExtensionRunner" - reload error 1/
             ),
           })
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

           sinon.assert.calledOnce(fakeExtensionRunner.registerCleanup);
           sinon.assert.calledOnce(anotherFakeExtensionRunner.registerCleanup);

           // Call the cleanup callback on the first runner.
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

           // Call the cleanup callback on the second and last runner.
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
        watchFile: '/path/to/watched/file',
        watchIgnored: '/path/to/ignored/file',
        onSourceChange: sinon.spy(() => {}),
        ignoreFiles: ['path/to/file', 'path/to/file2'],
        reloadExtension: sinon.spy(() => Promise.resolve()),
      };
      return {
        config,
        createWatcher: (customConfig = {}) => {
          // $FlowIgnore: allow use of inexact object literal for testing purpose.
          return defaultWatcherCreator({...config, ...customConfig});
        },
      };
    }

    it('configures a source watcher', () => {
      const {config, createWatcher} = prepare();
      createWatcher();
      sinon.assert.called(config.onSourceChange);
      sinon.assert.calledWith(
        config.onSourceChange,
        sinon.match({
          sourceDir: config.sourceDir,
          watchFile: config.watchFile,
          watchIgnored: config.watchIgnored,
          artifactsDir: config.artifactsDir,
          onChange: sinon.match.typeOf('function'),
        })
      );
    });

    it('configures a run command with the expected fileFilter', () => {
      const fileFilter = {wantFile: sinon.spy()};
      const createFileFilter = sinon.spy(() => fileFilter);
      const {config, createWatcher} = prepare();
      createWatcher({createFileFilter});
      sinon.assert.called(createFileFilter);
      sinon.assert.calledWith(
        createFileFilter,
        sinon.match({
          sourceDir: config.sourceDir,
          artifactsDir: config.artifactsDir,
          ignoreFiles: config.ignoreFiles,
        })
      );
      const {shouldWatchFile} = config.onSourceChange.firstCall.args[0];
      shouldWatchFile('path/to/file');
      sinon.assert.called(fileFilter.wantFile);
      sinon.assert.calledWith(fileFilter.wantFile, sinon.match('path/to/file'));
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

      sinon.assert.called(config.onSourceChange);
      sinon.assert.calledWith(
        config.onSourceChange,
        sinon.match({
          onChange: sinon.match.typeOf('function'),
        })
      );

      const {onChange} = config.onSourceChange.firstCall.args[0];
      // Simulate executing the handler when a source file changes.
      await onChange();
      sinon.assert.called(config.reloadExtension);
      sinon.assert.calledWith(
        config.reloadExtension,
        sinon.match(config.sourceDir)
      );
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
        watchFile: '/path/to/watched/file',
        watchIgnored: '/path/to/ignored/file',
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
          const mergedArgs = {...args, ...argOverride};
          const mergedOpts = {...options, ...optOverride};
          // $FlowIgnore: allow use of inexact object literal for testing purpose.
          return defaultReloadStrategy(mergedArgs, mergedOpts);
        },
      };
    }

    it('configures a watcher', () => {
      const {
        createWatcher, reloadStrategy,
        ...sentArgs
      } = prepare();

      reloadStrategy();
      sinon.assert.called(createWatcher);
      sinon.assert.calledWith(
        createWatcher,
        sinon.match({
          sourceDir: sentArgs.sourceDir,
          watchFile: sentArgs.watchFile,
          watchIgnored: sentArgs.watchIgnored,
          artifactsDir: sentArgs.artifactsDir,
          ignoreFiles: sentArgs.ignoreFiles,
        })
      );
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

      sinon.assert.calledOnce(createWatcher);
      sinon.assert.calledWith(
        createWatcher,
        sinon.match({
          reloadExtension: sinon.match.typeOf('function'),
        })
      );

      const sourceDir = '/fake/sourceDir';
      const {reloadExtension} = createWatcher.firstCall.args[0];
      reloadExtension(sourceDir);

      const {reloadExtensionBySourceDir} = extensionRunner;
      sinon.assert.calledOnce(reloadExtensionBySourceDir);
      sinon.assert.calledWith(
        reloadExtensionBySourceDir,
        sinon.match(sourceDir)
      );
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

      sinon.assert.called(extensionRunner.registerCleanup);
      sinon.assert.calledOnce(extensionRunner.registerCleanup);
      sinon.assert.calledWith(
        extensionRunner.registerCleanup,
        sinon.match.typeOf('function')
      );

      const registeredCb = extensionRunner.registerCleanup.firstCall.args[0];
      registeredCb();

      sinon.assert.called(watcher.close);
      sinon.assert.called(stdin.pause);
    });

    it('can reload when user presses R in shell console', async () => {
      const {extensionRunner, reloadStrategy} = prepare();

      const fakeStdin = createFakeStdin();
      sinon.spy(fakeStdin, 'setRawMode');
      sinon.spy(extensionRunner, 'reloadAllExtensions');

      try {
        await reloadStrategy({}, {stdin: fakeStdin});
        fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});

        // Wait for one tick.
        await Promise.resolve();

        sinon.assert.called(fakeStdin.setRawMode);
        sinon.assert.called(extensionRunner.reloadAllExtensions);
      } finally {
        exitKeypressLoop(fakeStdin);
      }
    });

    it('allows you to disable input', async function() {
      const {extensionRunner, reloadStrategy} = prepare();
      sinon.spy(extensionRunner, 'registerCleanup');

      const fakeStdin = createFakeStdin();
      sinon.spy(fakeStdin, 'pause');
      sinon.spy(fakeStdin, 'setRawMode');

      try {
        await reloadStrategy({noInput: true}, {stdin: fakeStdin});
        // This is meant to test that all input is ignored.
        sinon.assert.notCalled(fakeStdin.setRawMode);
      } finally {
        exitKeypressLoop(fakeStdin);
      }

      const cleanupCb = extensionRunner.registerCleanup.firstCall.args[0];
      cleanupCb();
      sinon.assert.notCalled(fakeStdin.pause);
    });

    it('can still reload when user presses R after a reload error',
       async () => {
         const {extensionRunner, reloadStrategy} = prepare({
           stubExtensionRunner: {
             reloadAllExtensions: sinon.spy(
               () => Promise.reject(new Error('fake reload error'))
             ),
           },
         });

         const fakeStdin = createFakeStdin();
         sinon.spy(fakeStdin, 'setRawMode');

         // Stub the `fakeStdin.once` method to be able to wait
         // once a promise resolved when the reloadStrategy method
         // did call `stdin.once('keypress', ...)`.
         const fakeStdinOnce = fakeStdin.once;
         sinon.stub(fakeStdin, 'once');

         function promiseWaitKeypress() {
           return new Promise((resolve) => {
             fakeStdin.once.callsFake((...args) => {
               if (args[0] === 'keypress') {
                 resolve();
               }
               return fakeStdinOnce.apply(fakeStdin, args);
             });
           });
         }

         try {
           let onceWaitKeypress = promiseWaitKeypress();
           await reloadStrategy({}, {stdin: fakeStdin});
           await onceWaitKeypress;

           onceWaitKeypress = promiseWaitKeypress();
           fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});
           await onceWaitKeypress;

           sinon.assert.called(fakeStdin.setRawMode);
           sinon.assert.calledOnce(extensionRunner.reloadAllExtensions);

           onceWaitKeypress = promiseWaitKeypress();
           fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});
           await onceWaitKeypress;

           sinon.assert.calledTwice(extensionRunner.reloadAllExtensions);
         } finally {
           exitKeypressLoop(fakeStdin);
         }
       });

    it('shuts down firefox on user request (CTRL+C in shell console)',
       async () => {
         const {extensionRunner, reloadStrategy} = prepare({
           stubExtensionRunner: {
             async exit() {},
           },
         });

         const fakeStdin = createFakeStdin();

         try {
           await reloadStrategy({}, {stdin: fakeStdin});

           // Wait for one tick.
           await Promise.resolve();

           fakeStdin.emit('keypress', 'c', {name: 'c', ctrl: true});

           // Wait for one tick.
           await Promise.resolve();

           sinon.assert.called(extensionRunner.exit);
         } finally {
           exitKeypressLoop(fakeStdin);
         }
       });

    it('pauses the web-ext process (CTRL+Z in shell console)', async () => {
      const {reloadStrategy} = prepare();

      const fakeStdin = createFakeStdin();

      const setRawMode = sinon.spy(fakeStdin, 'setRawMode');
      const fakeKill = sinon.spy(() => {});

      try {
        reloadStrategy({}, {stdin: fakeStdin, kill: fakeKill});

        // Wait for one tick.
        await Promise.resolve();

        fakeStdin.emit('keypress', 'z', {name: 'z', ctrl: true});

        // Wait for one tick.
        await Promise.resolve();

        sinon.assert.called(fakeKill);
        sinon.assert.calledWith(
          fakeKill,
          sinon.match(process.pid),
          sinon.match('SIGTSTP')
        );
        sinon.assert.callOrder(setRawMode, setRawMode, fakeKill, setRawMode);
        sinon.assert.calledThrice(setRawMode);
        sinon.assert.calledWith(setRawMode, sinon.match(true));
        sinon.assert.calledWith(setRawMode, sinon.match(false));
        sinon.assert.calledWith(setRawMode, sinon.match(true));
      } finally {
        exitKeypressLoop(fakeStdin);
      }
    });

  });

});

/* @flow */
import path from 'path';
import stream from 'stream';
import tty from 'tty';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import run, {
  defaultWatcherCreator,
  defaultReloadStrategy,
  defaultAddonReload,
} from '../../../src/cmd/run';
import {
  fixturePath,
  makeSureItFails,
  FakeExtensionRunner,
  getFakeFirefox,
  getFakeRemoteFirefox,
} from '../helpers';
import {createLogger} from '../../../src/util/logger';

const log = createLogger(__filename);
// Fake result for client.installTemporaryAddon().then(installResult => ...)
const tempInstallResult = {
  addon: {id: 'some-addon@test-suite'},
};

function createFakeExtensionRunner(params, deps, overriddenMethods = {}) {
  const runner = new FakeExtensionRunner();
  runner.params = params;
  runner.deps = deps;

  for (const [fnName, fn] of Object.entries(overriddenMethods)) {
    sinon.stub(runner, fnName).callsFake(fn);
  }

  return runner;
}

describe('run', () => {

  function prepareRun(fakeInstallResult) {
    const sourceDir = fixturePath('minimal-web-ext');

    const argv = {
      artifactsDir: path.join(sourceDir, 'web-ext-artifacts'),
      sourceDir,
      noReload: true,
      keepProfileChanges: false,
      browserConsole: false,
    };
    const options = {
      firefoxApp: getFakeFirefox(),
      firefoxClient: sinon.spy(() => {
        return Promise.resolve(getFakeRemoteFirefox({
          installTemporaryAddon: () =>
            Promise.resolve(
              fakeInstallResult || tempInstallResult
            ),
        }));
      }),
      reloadStrategy: sinon.spy(() => {
        log.debug('fake: reloadStrategy()');
      }),
      createExtensionRunner: sinon.spy(createFakeExtensionRunner),
    };

    return {
      argv,
      options,
      run: (customArgv = {}, customOpt = {}) => run(
        {...argv, ...customArgv},
        {...options, ...customOpt}
      ),
    };
  }

  it('passes a custom Firefox binary when specified', async () => {
    const firefox = '/pretend/path/to/Firefox/firefox-bin';
    const cmd = prepareRun();
    const {createExtensionRunner} = cmd.options;

    await cmd.run({firefox});
    assert.equal(createExtensionRunner.called, true);
    assert.equal(createExtensionRunner.firstCall.args[0].firefoxBinary,
                 firefox);
  });

  it('passes single url parameter to Firefox when specified', async () => {
    const cmd = prepareRun();
    const {createExtensionRunner} = cmd.options;
    const expectedStartUrls = 'www.example.com';

    await cmd.run({startUrl: expectedStartUrls});
    assert.ok(createExtensionRunner.called);
    assert.deepEqual(createExtensionRunner.firstCall.args[0].startUrl,
                     expectedStartUrls);
  });

  it('passes multiple url parameters to Firefox when specified', async () => {
    const cmd = prepareRun();
    const {createExtensionRunner} = cmd.options;
    const expectedStartUrls = [
      'www.one.com', 'www.two.com', 'www.three.com',
    ];

    await cmd.run({startUrl: expectedStartUrls});
    assert.ok(createExtensionRunner.called);
    assert.deepEqual(createExtensionRunner.firstCall.args[0].startUrl,
                     expectedStartUrls);
  });

  it('passes the expected parameters to the extension runner', async () => {
    const cmd = prepareRun();
    const {createExtensionRunner} = cmd.options;
    const runOptions = {
      preInstall: true,
      keepProfileChanges: true,
      noReload: true,
      browserConsole: true,
      firefox: '/path/to/custom/bin/firefox',
      customPrefs: {'my.custom.pref': 'value'},
      firefoxProfile: '/path/to/custom/profile',
    };

    await cmd.run(runOptions);
    assert.ok(createExtensionRunner.called);
    const runnerParams = createExtensionRunner.firstCall.args[0];
    assert.deepEqual({
      preInstall: runnerParams.preInstall,
      keepProfileChanges: runnerParams.keepProfileChanges,
      noReload: runnerParams.noReload,
      browserConsole: runnerParams.browserConsole,
      firefox: runnerParams.firefoxBinary,
      customPrefs: runnerParams.customPrefs,
      firefoxProfile: runnerParams.profilePath,
    }, runOptions);
    assert.equal(runnerParams.extensions.length, 1);
    assert.equal(runnerParams.extensions[0].sourceDir, cmd.argv.sourceDir);
    assert.deepEqual(runnerParams.targets, ['firefox-desktop']);
  });

  it('passes the expected dependencies to the extension runner', async () => {
    const cmd = prepareRun();
    const {createExtensionRunner, firefoxApp, firefoxClient} = cmd.options;

    await cmd.run();
    assert.ok(createExtensionRunner.called);
    const runnerDeps = createExtensionRunner.firstCall.args[1];
    assert.deepEqual(runnerDeps, {firefoxApp, firefoxClient});
  });

  it('can watch and reload the extension', async () => {
    const cmd = prepareRun();
    const {sourceDir, artifactsDir} = cmd.argv;
    const {reloadStrategy} = cmd.options;

    await cmd.run({noReload: false});
    assert.equal(reloadStrategy.called, true);
    const args = reloadStrategy.firstCall.args[0];
    assert.equal(args.sourceDir, sourceDir);
    assert.equal(args.artifactsDir, artifactsDir);
  });

  it('will not reload when using --pre-install', async () => {
    const cmd = prepareRun();
    const {reloadStrategy} = cmd.options;

    // --pre-install should imply --no-reload
    await cmd.run({noReload: false, preInstall: true});
    assert.equal(reloadStrategy.called, false);
  });

  it('allows you to opt out of extension reloading', async () => {
    const cmd = prepareRun();
    const {reloadStrategy} = cmd.options;

    await cmd.run({noReload: true});
    assert.equal(reloadStrategy.called, false);
  });

  describe('defaultWatcherCreator', () => {

    function prepare() {
      const config = {
        //addonId: 'some-addon@test-suite',
        /*client: fake(RemoteFirefox.prototype, {
          reloadAddon: () => Promise.resolve(),
        }),*/
        sourceDir: '/path/to/extension/source/',
        artifactsDir: '/path/to/web-ext-artifacts',
        onSourceChange: sinon.spy(() => {}),
        ignoreFiles: ['path/to/file', 'path/to/file2'],
        addonReload: sinon.spy(() => Promise.resolve()),
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
      assert.equal(config.addonReload.called, true);
      const reloadArgs = config.addonReload.firstCall.args;
      assert.equal(reloadArgs[0], config.sourceDir);
    });

  });

  describe('defaultReloadStrategy', () => {

    function prepare({stubExtensionRunner} = {}) {
      const watcher = {
        close: sinon.spy(() => {}),
      };
      const extensionRunner = createFakeExtensionRunner({}, {},
                                                        stubExtensionRunner);
      const args = {
        extensionRunner,
        sourceDir: '/path/to/extension/source',
        artifactsDir: '/path/to/web-ext-artifacts/',
        ignoreFiles: ['first/file', 'second/file'],
      };
      const options = {
        addonReload: sinon.spy(() => Promise.resolve()),
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
        createWatcher, reloadStrategy, extensionRunner,
        ...sentArgs
      } = prepare();

      reloadStrategy();
      assert.ok(createWatcher.called);
      const receivedArgs = createWatcher.firstCall.args[0];
      assert.equal(receivedArgs.client, sentArgs.client);
      assert.equal(receivedArgs.sourceDir, sentArgs.sourceDir);
      assert.equal(receivedArgs.artifactsDir, sentArgs.artifactsDir);
      assert.deepEqual(receivedArgs.ignoreFiles, sentArgs.ignoreFiles);
      assert.equal(typeof receivedArgs.addonReload, 'function');

      receivedArgs.addonReload('fake/src/dir');

      assert.ok(sentArgs.addonReload.called);
      assert.equal(sentArgs.addonReload.firstCall.args[0].sourceDir,
                   'fake/src/dir');
      assert.equal(sentArgs.addonReload.firstCall.args[0].extensionRunner,
                   extensionRunner);
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
      const {addonReload, reloadStrategy} = prepare();

      const fakeStdin = new tty.ReadStream();
      sinon.spy(fakeStdin, 'setRawMode');

      await reloadStrategy({}, {stdin: fakeStdin});
      fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});

      // Wait for one tick.
      await Promise.resolve();

      assert.ok(fakeStdin.setRawMode.called);
      assert.ok(addonReload.called);
      // pressing R reloads all the extensions by not including a sourceDir
      // in the options.
      assert.equal(addonReload.firstCall.args[0].sourceDir, undefined);
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

  describe('defaultAddonReload', () => {
    const desktopNotifications = sinon.spy(() => Promise.resolve());
    const args = {
      sourceDir: '/path/to/some-addon',
      desktopNotifications,
    };

    it('reloads an addon by sourceDir', async () => {
      const extensionRunner = createFakeExtensionRunner({}, {}, {
        reloadExtensionBySourceDir: () => Promise.resolve(),
      });
      await defaultAddonReload({extensionRunner, ...args});

      assert.ok(extensionRunner.reloadExtensionBySourceDir.called, true);
      const reloadArgs = extensionRunner.reloadExtensionBySourceDir
                                        .firstCall.args;
      assert.equal(reloadArgs[0], args.sourceDir);
    });

    it('reloads all addons', async () => {
      const extensionRunner = createFakeExtensionRunner({}, {}, {
        reloadAllExtensions: () => Promise.resolve(),
      });
      await defaultAddonReload({extensionRunner});

      assert.ok(extensionRunner.reloadAllExtensions.called, true);
      const reloadArgs = extensionRunner.reloadAllExtensions
                                        .firstCall.args;
      assert.equal(reloadArgs[0], undefined);
    });

    it('notifies user on error from source change handler', async () => {
      const extensionRunner = createFakeExtensionRunner({}, {}, {
        reloadExtensionBySourceDir: () => Promise.reject(new Error('an error')),
      });
      await defaultAddonReload({extensionRunner, ...args})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(
            desktopNotifications.called, true
          );
          assert.equal(
            desktopNotifications.firstCall.args[0].message,
            error.message
          );
        });
    });

    it('throws errors from source change handler', async () => {
      const extensionRunner = createFakeExtensionRunner({}, {}, {
        reloadExtensionBySourceDir: () => Promise.reject(new Error('an error')),
      });
      await defaultAddonReload({extensionRunner, ...args})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(error.message, 'an error');
        });
    });

  });

});

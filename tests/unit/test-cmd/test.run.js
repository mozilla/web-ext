/* @flow */
import path from 'path';
import EventEmitter from 'events';
import tty from 'tty';
import stream from 'stream';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  onlyInstancesOf,
  WebExtError,
  RemoteTempInstallNotSupported,
} from '../../../src/errors';
import run, {
  defaultWatcherCreator,
  defaultReloadStrategy,
  defaultAddonReload,
} from '../../../src/cmd/run';
import * as defaultFirefoxApp from '../../../src/firefox';
import {RemoteFirefox} from '../../../src/firefox/remote';
import {
  fakeFirefoxClient,
  fake,
  fixturePath,
  makeSureItFails,
} from '../helpers';
import {createLogger} from '../../../src/util/logger';

const log = createLogger(__filename);
// Fake result for client.installTemporaryAddon().then(installResult => ...)
const tempInstallResult = {
  addon: {id: 'some-addon@test-suite'},
};
// Fake missing addon id result for client.installTemporaryAddon
const tempInstallResultMissingAddonId = {
  addon: {id: null},
};


describe('run', () => {

  function prepareRun(fakeInstallResult) {
    const sourceDir = fixturePath('minimal-web-ext');

    const argv = {
      artifactsDir: path.join(sourceDir, 'web-ext-artifacts'),
      sourceDir,
      noReload: true,
      keepProfileChanges: false,
    };
    const options = {
      firefoxApp: getFakeFirefox(),
      firefoxClient: sinon.spy(() => {
        return Promise.resolve(fake(RemoteFirefox.prototype, {
          installTemporaryAddon: () =>
            Promise.resolve(
              fakeInstallResult || tempInstallResult
            ),
        }));
      }),
      reloadStrategy: sinon.spy(() => {
        log.debug('fake: reloadStrategy()');
      }),
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

  function getFakeFirefox(implementations = {}, port = 6005) {
    const profile = {}; // empty object just to avoid errors.
    const firefox = () => Promise.resolve();
    const allImplementations = {
      createProfile: () => Promise.resolve(profile),
      copyProfile: () => Promise.resolve(profile),
      useProfile: () => Promise.resolve(profile),
      installExtension: () => Promise.resolve(),
      run: () => Promise.resolve({firefox, debuggerPort: port}),
      ...implementations,
    };
    return fake(defaultFirefoxApp, allImplementations);
  }

  it('installs and runs the extension', () => {

    const profile = {};

    const cmd = prepareRun();
    const {firefoxApp} = cmd.options;
    const firefoxClient = fake(RemoteFirefox.prototype, {
      installTemporaryAddon: () => Promise.resolve(tempInstallResult),
    });

    return cmd.run({}, {
      firefoxClient: sinon.spy(() => {
        return Promise.resolve(firefoxClient);
      }),
    }).then(() => {
      const install = firefoxClient.installTemporaryAddon;
      assert.equal(install.called, true);
      assert.equal(install.firstCall.args[0], cmd.argv.sourceDir);

      assert.equal(firefoxApp.run.called, true);
      assert.deepEqual(firefoxApp.run.firstCall.args[0], profile);
    });
  });

  it('runs extension in correct port', () => {
    const cmd = prepareRun();
    const {firefoxClient} = cmd.options;
    const port = 6008;
    const firefoxApp = getFakeFirefox({}, port);

    return cmd.run({}, {
      firefoxApp,
    }).then(() => {
      assert.equal(firefoxApp.run.called, true);

      assert.equal(firefoxClient.firstCall.args[0].port, port);
    });
  });

  it('suggests --pre-install when remote install not supported', () => {
    const cmd = prepareRun();
    const firefoxClient = fake(RemoteFirefox.prototype, {
      // Simulate an older Firefox that will throw this error.
      installTemporaryAddon:
        () => Promise.reject(new RemoteTempInstallNotSupported('')),
    });

    return cmd.run(
      {}, {firefoxClient: () => Promise.resolve(firefoxClient)})
      .then(makeSureItFails())
      .catch(onlyInstancesOf(WebExtError, (error) => {
        assert.equal(firefoxClient.installTemporaryAddon.called, true);
        assert.match(error.message, /use --pre-install/);
      }));
  });

  it('passes a custom Firefox binary when specified', () => {
    const firefox = '/pretend/path/to/Firefox/firefox-bin';
    const cmd = prepareRun();
    const {firefoxApp} = cmd.options;

    return cmd.run({firefox}).then(() => {
      assert.equal(firefoxApp.run.called, true);
      assert.equal(firefoxApp.run.firstCall.args[1].firefoxBinary,
                   firefox);
    });
  });

  it('passes single url parameter to Firefox when specified', () => {
    const cmd = prepareRun();
    const {firefoxApp} = cmd.options;
    const expectedBinaryArgs = ['--url', 'www.example.com'];

    return cmd.run({startUrl: 'www.example.com'}).then(() => {
      assert.ok(firefoxApp.run.called);
      assert.deepEqual(firefoxApp.run.firstCall.args[1].binaryArgs,
                       expectedBinaryArgs);
    });
  });

  it('passes multiple url parameters to Firefox when specified', () => {
    const cmd = prepareRun();
    const {firefoxApp} = cmd.options;
    const expectedBinaryArgs = [
      '--url', 'www.one.com', '--url', 'www.two.com', '--url', 'www.three.com',
    ];

    return cmd.run({startUrl: [
      'www.one.com', 'www.two.com', 'www.three.com',
    ]}).then(() => {
      assert.ok(firefoxApp.run.called);
      assert.deepEqual(firefoxApp.run.firstCall.args[1].binaryArgs,
                       expectedBinaryArgs);
    });
  });

  it('passes -jsconsole when --browser-console is specified', () => {
    const cmd = prepareRun();
    const {firefoxApp} = cmd.options;

    return cmd.run({browserConsole: true}).then(() => {
      assert.ok(firefoxApp.run.called);
      assert.equal(firefoxApp.run.firstCall.args[1].binaryArgs,
                   '-jsconsole');
    });
  });

  it('passes a custom Firefox profile when specified', () => {
    const firefoxProfile = '/pretend/path/to/firefox/profile';
    const cmd = prepareRun();
    const {firefoxApp} = cmd.options;

    return cmd.run({firefoxProfile}).then(() => {
      assert.equal(firefoxApp.createProfile.called, false);
      assert.equal(firefoxApp.copyProfile.called, true);
      assert.equal(firefoxApp.copyProfile.firstCall.args[0],
                   firefoxProfile);
    });
  });

  it('keeps changes in custom profile when specified', () => {
    const firefoxProfile = '/pretend/path/to/firefox/profile';
    const cmd = prepareRun();
    const {firefoxApp} = cmd.options;

    return cmd.run({firefoxProfile, keepProfileChanges: true}).then(() => {
      assert.equal(firefoxApp.useProfile.called, true);
      assert.equal(firefoxApp.useProfile.firstCall.args[0],
                   firefoxProfile);
    });
  });

  it('can pre-install into the profile before startup', () => {
    const cmd = prepareRun();
    const firefoxClient = fake(RemoteFirefox.prototype, {
      installTemporaryAddon: () => Promise.resolve(tempInstallResult),
    });
    const fakeProfile = {};
    const firefoxApp = getFakeFirefox({
      copyProfile: () => fakeProfile,
    });
    const {sourceDir} = cmd.argv;

    return cmd.run({preInstall: true}, {
      firefoxApp,
      firefoxClient: sinon.spy(() => Promise.resolve(firefoxClient)),
    }).then(() => {
      assert.equal(firefoxApp.installExtension.called, true);
      assert.equal(firefoxClient.installTemporaryAddon.called, false);

      const install = firefoxApp.installExtension.firstCall.args[0];
      assert.equal(install.asProxy, true);
      assert.equal(install.manifestData.applications.gecko.id,
                   'minimal-example@web-ext-test-suite');
      assert.deepEqual(install.profile, fakeProfile);
      // This needs to be the source of the extension.
      assert.equal(install.extensionPath, sourceDir);
    });
  });

  it('can watch and reload the extension', () => {
    const cmd = prepareRun();
    const {sourceDir, artifactsDir} = cmd.argv;
    const {reloadStrategy} = cmd.options;

    return cmd.run({noReload: false}).then(() => {
      assert.equal(reloadStrategy.called, true);
      const args = reloadStrategy.firstCall.args[0];
      assert.equal(args.sourceDir, sourceDir);
      assert.equal(args.artifactsDir, artifactsDir);
      assert.equal(args.addonId, tempInstallResult.addon.id);
    });
  });

  it('raise an error on addonId missing from installTemporaryAddon result',
    () => {
      const cmd = prepareRun(tempInstallResultMissingAddonId);

      return cmd.run({noReload: false})
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
    }
  );

  it('will not reload when using --pre-install', () => {
    const cmd = prepareRun();
    const {reloadStrategy} = cmd.options;

    // --pre-install should imply --no-reload
    return cmd.run({noReload: false, preInstall: true}).then(() => {
      assert.equal(reloadStrategy.called, false);
    });
  });

  it('will not connect to the debugger when using --pre-install', () => {
    const cmd = prepareRun();
    const {firefoxClient} = cmd.options;

    return cmd.run({preInstall: true}).then(() => {
      assert.equal(firefoxClient.called, false);
    });
  });

  it('allows you to opt out of extension reloading', () => {
    const cmd = prepareRun();
    const {reloadStrategy} = cmd.options;

    return cmd.run({noReload: true}).then(() => {
      assert.equal(reloadStrategy.called, false);
    });
  });

  describe('defaultWatcherCreator', () => {

    function prepare() {
      const config = {
        addonId: 'some-addon@test-suite',
        client: fake(RemoteFirefox.prototype, {
          reloadAddon: () => Promise.resolve(),
        }),
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

    it('reloads the extension', () => {
      const {config, createWatcher} = prepare();
      createWatcher();

      const callArgs = config.onSourceChange.firstCall.args[0];
      assert.typeOf(callArgs.onChange, 'function');
      // Simulate executing the handler when a source file changes.
      return callArgs.onChange()
        .then(() => {
          assert.equal(config.addonReload.called, true);
          const reloadArgs = config.addonReload.firstCall.args;
          assert.ok(config.addonId);
          assert.equal(reloadArgs[0].addonId, config.addonId);
          assert.equal(reloadArgs[0].client, config.client);
        });
    });

  });

  describe('defaultReloadStrategy', () => {

    class StubChildProcess extends EventEmitter {
      stderr = new EventEmitter();
      stdout = new EventEmitter();
      kill = sinon.spy(() => {});
    }

    function prepare() {
      const client = new RemoteFirefox(fakeFirefoxClient());
      const watcher = {
        close: sinon.spy(() => {}),
      };
      const args = {
        addonId: 'some-addon@test-suite',
        client,
        firefoxProcess: new StubChildProcess(),
        profile: {},
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
        client,
        watcher,
        reloadStrategy: async (argOverride = {}, optOverride = {}) => {
          return defaultReloadStrategy(
            {...args, ...argOverride},
            {...options, ...optOverride});
        },
      };
    }

    it('cleans up connections when firefox closes', () => {
      const {
        firefoxProcess, client, watcher, reloadStrategy, stdin,
      } = prepare();

      sinon.spy(stdin, 'pause');

      reloadStrategy();
      firefoxProcess.emit('close');
      assert.equal(client.client.disconnect.called, true);
      assert.equal(watcher.close.called, true);
      assert.ok(stdin.pause.called);
    });

    it('configures a watcher', () => {
      const {
        createWatcher, reloadStrategy,
        ...sentArgs
      } = prepare();

      reloadStrategy();
      assert.equal(createWatcher.called, true);
      const receivedArgs = createWatcher.firstCall.args[0];
      assert.equal(receivedArgs.client, sentArgs.client);
      assert.equal(receivedArgs.sourceDir, sentArgs.sourceDir);
      assert.equal(receivedArgs.artifactsDir, sentArgs.artifactsDir);
      assert.equal(receivedArgs.addonId, sentArgs.addonId);
      assert.deepEqual(receivedArgs.ignoreFiles, sentArgs.ignoreFiles);
    });

    it('can reload when user presses R in shell console', () => {
      const {addonReload, reloadStrategy} = prepare();

      const fakeStdin = new tty.ReadStream();
      sinon.spy(fakeStdin, 'setRawMode');

      return reloadStrategy({}, {stdin: fakeStdin})
        .then(() => {
          fakeStdin.emit('keypress', 'r', {name: 'r', ctrl: false});
        })
        .then(() => {
          assert.ok(fakeStdin.setRawMode.called);
          assert.ok(addonReload.called);
          assert.equal(addonReload.firstCall.args[0].addonId,
            tempInstallResult.addon.id);
        });
    });

    it('shuts down firefox on user request (CTRL+C in shell console)', () => {
      const {firefoxProcess, reloadStrategy} = prepare();
      const fakeStdin = new tty.ReadStream();

      return reloadStrategy({}, {stdin: fakeStdin})
        .then(() => {
          fakeStdin.emit('keypress', 'c', {name: 'c', ctrl: true});
        }).then(() => {
          assert.ok(firefoxProcess.kill.called);
        });
    });

  });

  describe('defaultAddonReload', () => {
    function createFakeRemoteFirefox(firefoxClient, {reloadAddon}) {
      class FakeRemoteFirefox extends RemoteFirefox {
        reloadAddon = sinon.spy(reloadAddon)
      }
      const client = new FakeRemoteFirefox(firefoxClient);
      return client;
    }

    const desktopNotifications = sinon.spy(() => Promise.resolve());
    const args = {
      addonId: 'some-addon@test-suite',
      desktopNotifications,
    };

    it('reloads addon', () => {
      const client = createFakeRemoteFirefox(fakeFirefoxClient(), {
        reloadAddon: () => Promise.resolve(),
      });
      return defaultAddonReload({client, ...args})
        .then(() => {
          assert.ok(client.reloadAddon.called, true);
          const reloadArgs = client.reloadAddon.firstCall.args;
          assert.equal(reloadArgs[0], args.addonId);
        });
    });

    it('notifies user on error from source change handler', () => {
      const client = createFakeRemoteFirefox(fakeFirefoxClient(), {
        reloadAddon: () => Promise.reject(new Error('an error')),
      });
      return defaultAddonReload({client, ...args})
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

    it('throws errors from source change handler', () => {
      const client = createFakeRemoteFirefox(fakeFirefoxClient(), {
        reloadAddon: () => Promise.reject(new Error('an error')),
      });
      return defaultAddonReload({client, ...args})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(error.message, 'an error');
        });
    });

  });

});

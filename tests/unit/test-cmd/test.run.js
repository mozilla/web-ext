/* @flow */
import path from 'path';
import {EventEmitter} from 'events';
import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {onlyInstancesOf, WebExtError, RemoteTempInstallNotSupported}
  from '../../../src/errors';
import run, {
  defaultFirefoxClient, defaultWatcherCreator, defaultReloadStrategy,
} from '../../../src/cmd/run';
import * as defaultFirefoxApp from '../../../src/firefox';
import {RemoteFirefox} from '../../../src/firefox/remote';
import {TCPConnectError, fakeFirefoxClient, makeSureItFails, fake, fixturePath}
  from '../helpers';
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
    let argv = {
      artifactsDir: path.join(sourceDir, 'web-ext-artifacts'),
      sourceDir,
      noReload: true,
    };
    let options = {
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

  function getFakeFirefox(implementations = {}) {
    let profile = {}; // empty object just to avoid errors.
    let allImplementations = {
      createProfile: () => Promise.resolve(profile),
      copyProfile: () => Promise.resolve(profile),
      installExtension: () => Promise.resolve(),
      run: () => Promise.resolve(),
      ...implementations,
    };
    return fake(defaultFirefoxApp, allImplementations);
  }

  it('installs and runs the extension', () => {

    let profile = {};

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
        profile: {},
        client: fake(RemoteFirefox.prototype, {
          reloadAddon: () => Promise.resolve(),
        }),
        sourceDir: '/path/to/extension/source/',
        artifactsDir: '/path/to/web-ext-artifacts',
        onSourceChange: sinon.spy(() => {}),
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
          assert.equal(config.client.reloadAddon.called, true);
          const reloadArgs = config.client.reloadAddon.firstCall.args;
          assert.ok(config.addonId);
          assert.equal(reloadArgs[0], config.addonId);
        });
    });

    it('throws errors from source change handler', () => {
      const {createWatcher, config} = prepare();
      config.client.reloadAddon = () => Promise.reject(new Error('an error'));
      createWatcher();

      assert.equal(config.onSourceChange.called, true);
      // Simulate executing the handler when a source file changes.
      return config.onSourceChange.firstCall.args[0].onChange()
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(error.message, 'an error');
        });
    });

  });

  describe('defaultReloadStrategy', () => {

    function prepare() {
      const client = new RemoteFirefox(fakeFirefoxClient());
      const watcher = {
        close: sinon.spy(() => {}),
      };
      const args = {
        addonId: 'some-addon@test-suite',
        client,
        // $FLOW_IGNORE: fake a Firefox ChildProcess using an EventEmitter for testing reasons.
        firefoxProcess: new EventEmitter(),
        profile: {},
        sourceDir: '/path/to/extension/source',
        artifactsDir: '/path/to/web-ext-artifacts/',
      };
      const options = {
        createWatcher: sinon.spy(() => watcher),
      };
      return {
        ...args,
        ...options,
        client,
        watcher,
        reloadStrategy: (argOverride = {}, optOverride = {}) => {
          return defaultReloadStrategy(
            {...args, ...argOverride},
            {...options, ...optOverride});
        },
      };
    }

    it('cleans up connections when firefox closes', () => {
      const {firefoxProcess, client, watcher, reloadStrategy} = prepare();
      reloadStrategy();
      firefoxProcess.emit('close');
      assert.equal(client.client.disconnect.called, true);
      assert.equal(watcher.close.called, true);
    });

    it('configures a watcher', () => {
      const {createWatcher, reloadStrategy, ...sentArgs} = prepare();
      reloadStrategy();
      assert.equal(createWatcher.called, true);
      const receivedArgs = createWatcher.firstCall.args[0];
      assert.equal(receivedArgs.client, sentArgs.client);
      assert.equal(receivedArgs.sourceDir, sentArgs.sourceDir);
      assert.equal(receivedArgs.artifactsDir, sentArgs.artifactsDir);
      assert.equal(receivedArgs.addonId, sentArgs.addonId);
    });

  });

  describe('firefoxClient', () => {

    function firefoxClient(opt = {}) {
      return defaultFirefoxClient({maxRetries: 0, retryInterval: 1, ...opt});
    }

    it('retries after a connection error', () => {
      const client = new RemoteFirefox(fakeFirefoxClient());
      var tryCount = 0;
      const connectToFirefox = sinon.spy(() => new Promise(
        (resolve, reject) => {
          tryCount ++;
          if (tryCount === 1) {
            reject(new TCPConnectError('first connection fails'));
          } else {
            // The second connection succeeds.
            resolve(client);
          }
        }));

      return firefoxClient({connectToFirefox, maxRetries: 3})
        .then(() => {
          assert.equal(connectToFirefox.callCount, 2);
        });
    });

    it('only retries connection errors', () => {
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new Error('not a connection error')));

      return firefoxClient({connectToFirefox, maxRetries: 2})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(connectToFirefox.callCount, 1);
          assert.equal(error.message, 'not a connection error');
        });
    });

    it('gives up connecting after too many retries', () => {
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new TCPConnectError('failure')));

      return firefoxClient({connectToFirefox, maxRetries: 2})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(connectToFirefox.callCount, 3);
          assert.equal(error.message, 'failure');
        });
    });

  });

});

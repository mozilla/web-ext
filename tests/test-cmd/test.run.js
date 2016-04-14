/* @flow */
import path from 'path';
import {EventEmitter} from 'events';
import deepcopy from 'deepcopy';
import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {ExtendableError} from '../../src/util/es6-modules';
import run, {defaultWatcherCreator, defaultReloadStrategy, ExtensionRunner}
  from '../../src/cmd/run';
import * as firefox from '../../src/firefox';
import {RemoteFirefox} from '../../src/firefox/remote';
import {makeSureItFails, fake, fixturePath} from '../helpers';
import {createLogger} from '../../src/util/logger';
import {basicManifest} from '../test-util/test.manifest';

const log = createLogger(__filename);


describe('run', () => {

  function prepareRun() {
    const sourceDir = fixturePath('minimal-web-ext');
    let argv = {
      artifactsDir: path.join(sourceDir, 'web-ext-artifacts'),
      sourceDir,
      noReload: true,
    };
    let options = {
      firefox: getFakeFirefox(),
      reloadStrategy: sinon.spy(() => {
        log.debug('fake: reloadStrategy()');
      }),
    };

    return {
      argv, options,
      run: (customArgv={}, customOpt={}) => run(
        {...argv, ...customArgv},
        {...options, ...customOpt}
      ),
    };
  }

  function getFakeFirefox(implementations={}) {
    let profile = {}; // empty object just to avoid errors.
    let allImplementations = {
      createProfile: () => Promise.resolve(profile),
      copyProfile: () => Promise.resolve(profile),
      installExtension: () => Promise.resolve(),
      run: () => Promise.resolve(),
      ...implementations,
    };
    return fake(firefox, allImplementations);
  }

  it('installs and runs the extension', () => {

    let profile = {};

    const cmd = prepareRun();
    const {firefox} = cmd.options;

    return cmd.run().then(() => {
      let install = cmd.options.firefox.installExtension;
      assert.equal(install.called, true);
      assert.equal(
          install.firstCall.args[0].manifestData.applications.gecko.id,
          'minimal-example@web-ext-test-suite');
      assert.deepEqual(install.firstCall.args[0].profile, profile);
      assert.match(install.firstCall.args[0].extensionPath,
                   /minimal_extension-1\.0\.xpi/);

      assert.equal(firefox.run.called, true);
      assert.deepEqual(firefox.run.firstCall.args[0], profile);
    });
  });

  it('passes a custom Firefox binary when specified', () => {
    const firefoxBinary = '/pretend/path/to/Firefox/firefox-bin';
    const cmd = prepareRun();
    const {firefox} = cmd.options;

    return cmd.run({firefoxBinary}).then(() => {
      assert.equal(firefox.run.called, true);
      assert.equal(firefox.run.firstCall.args[1].firefoxBinary,
                   firefoxBinary);
    });
  });

  it('passes a custom Firefox profile when specified', () => {
    const firefoxProfile = '/pretend/path/to/firefox/profile';
    const cmd = prepareRun();
    const {firefox} = cmd.options;

    return cmd.run({firefoxProfile}).then(() => {
      assert.equal(firefox.createProfile.called, false);
      assert.equal(firefox.copyProfile.called, true);
      assert.equal(firefox.copyProfile.firstCall.args[0],
                   firefoxProfile);
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
      assert.typeOf(args.createRunner, 'function');
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
        profile: {},
        client: fake(RemoteFirefox.prototype),
        sourceDir: '/path/to/extension/source/',
        artifactsDir: '/path/to/web-ext-artifacts',
        createRunner: (cb) => cb(fake(ExtensionRunner.prototype)),
        onSourceChange: sinon.spy(() => {}),
      };
      return {
        config,
        createWatcher: (customConfig={}) => {
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

    it('builds, installs, and reloads the extension', () => {
      const {config, createWatcher} = prepare();

      const runner = fake(ExtensionRunner.prototype, {
        install: sinon.spy(() => Promise.resolve()),
        buildExtension: sinon.spy(() => Promise.resolve({})),
      });
      runner.manifestData = deepcopy(basicManifest);
      createWatcher({createRunner: (cb) => cb(runner)});

      const callArgs = config.onSourceChange.firstCall.args[0];
      assert.typeOf(callArgs.onChange, 'function');
      // Simulate executing the handler when a source file changes.
      return callArgs.onChange()
        .then(() => {
          assert.equal(runner.buildExtension.called, true);
          assert.equal(runner.install.called, true);

          assert.equal(config.client.reloadAddon.called, true);
          const reloadArgs = config.client.reloadAddon.firstCall.args;
          assert.equal(reloadArgs[0], 'basic-manifest@web-ext-test-suite');
        });
    });

    it('throws errors from source change handler', () => {
      const createRunner = (cb) => cb(fake(ExtensionRunner.prototype, {
        buildExtension: () => Promise.resolve({}),
        install: () => Promise.reject(new Error('fake installation error')),
      }));
      const {createWatcher, config} = prepare();
      createWatcher({createRunner});

      assert.equal(config.onSourceChange.called, true);
      // Simulate an error triggered from the source change handler.
      return config.onSourceChange.firstCall.args[0].onChange()
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(error.message, 'fake installation error');
        });
    });

  });

  describe('defaultReloadStrategy', () => {

    function prepare() {
      const client = {
        disconnect: sinon.spy(() => {}),
      };
      const watcher = {
        close: sinon.spy(() => {}),
      };
      const args = {
        firefox: new EventEmitter(),
        profile: {},
        sourceDir: '/path/to/extension/source',
        artifactsDir: '/path/to/web-ext-artifacts/',
        createRunner: sinon.spy((cb) => cb(fake(ExtensionRunner.prototype))),
      };
      const options = {
        connectToFirefox: sinon.spy(() => Promise.resolve(client)),
        createWatcher: sinon.spy(() => watcher),
        maxRetries: 0,
        retryInterval: 1,
      };
      return {
        ...args,
        ...options,
        client,
        watcher,
        reloadStrategy: (argOverride={}, optOverride={}) => {
          return defaultReloadStrategy(
            {...args, ...argOverride},
            {...options, ...optOverride});
        },
      };
    }

    class ConnError extends ExtendableError {
      code: string;
      constructor(msg) {
        super(msg);
        this.code = 'ECONNREFUSED';
      }
    }

    it('cleans up connections when firefox closes', () => {
      const {firefox, client, watcher, reloadStrategy} = prepare();
      return reloadStrategy()
        .then(() => {
          firefox.emit('close');
          assert.equal(client.disconnect.called, true);
          assert.equal(watcher.close.called, true);
        });
    });

    it('ignores uninitialized objects when firefox closes', () => {
      const {firefox, client, watcher, reloadStrategy} = prepare();
      return reloadStrategy(
        {}, {
          connectToFirefox: () => Promise.reject(
            new ConnError('connect error')),
        })
        .then(makeSureItFails())
        .catch(() => {
          firefox.emit('close');
          assert.equal(client.disconnect.called, false);
          assert.equal(watcher.close.called, false);
        });
    });

    it('configures a watcher', () => {
      const {createWatcher, reloadStrategy, ...sentArgs} = prepare();
      return reloadStrategy().then(() => {
        assert.equal(createWatcher.called, true);
        const receivedArgs = createWatcher.firstCall.args[0];
        assert.equal(receivedArgs.profile, sentArgs.profile);
        assert.equal(receivedArgs.client, sentArgs.client);
        assert.equal(receivedArgs.sourceDir, sentArgs.sourceDir);
        assert.equal(receivedArgs.artifactsDir, sentArgs.artifactsDir);
        assert.equal(receivedArgs.createRunner, sentArgs.createRunner);
      });
    });

    it('retries after a connection error', () => {
      const {reloadStrategy} = prepare();
      var tryCount = 0;
      const connectToFirefox = sinon.spy(() => new Promise(
        (resolve, reject) => {
          tryCount ++;
          if (tryCount === 1) {
            reject(new ConnError('first connection fails'));
          } else {
            // The second connection succeeds.
            resolve();
          }
        }));

      return reloadStrategy({}, {connectToFirefox, maxRetries: 3})
        .then(() => {
          assert.equal(connectToFirefox.callCount, 2);
        });
    });

    it('only retries connection errors', () => {
      const {reloadStrategy} = prepare();
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new Error('not a connection error')));

      return reloadStrategy({}, {connectToFirefox, maxRetries: 2})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(connectToFirefox.callCount, 1);
          assert.equal(error.message, 'not a connection error');
        });
    });

    it('gives up connecting after too many retries', () => {
      const {reloadStrategy} = prepare();
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new ConnError('failure')));

      return reloadStrategy({}, {connectToFirefox, maxRetries: 2})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(connectToFirefox.callCount, 3);
          assert.equal(error.message, 'failure');
        });
    });

  });

});

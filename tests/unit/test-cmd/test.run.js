/* @flow */
import path from 'path';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import run from '../../../src/cmd/run';
import {
  fixturePath,
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

describe('run', () => {

  function prepareRun(fakeInstallResult) {
    const sourceDir = fixturePath('minimal-web-ext');

    const argv = {
      artifactsDir: path.join(sourceDir, 'web-ext-artifacts'),
      sourceDir,
      noReload: true,
      keepProfileChanges: false,
      browserConsole: false,
      lint: false,
    };
    const options = {
      buildExtension: sinon.spy(() => {}),
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
      FirefoxDesktopExtensionRunner: sinon.spy(FakeExtensionRunner),
      MultiExtensionRunner: sinon.spy(FakeExtensionRunner),
      desktopNotifications: sinon.spy(() => {}),
      linter: sinon.spy(() => Promise.resolve()),
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
    const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);
    await cmd.run({firefox}, {FirefoxDesktopExtensionRunner});
    sinon.assert.calledWithMatch(
      FirefoxDesktopExtensionRunner, {firefoxBinary: firefox}
    );
  });

  it('passes startUrl parameter to Firefox when specified', async () => {
    const cmd = prepareRun();
    const expectedStartUrls = ['www.example.com'];
    const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);

    await cmd.run({startUrl: expectedStartUrls},
                  {FirefoxDesktopExtensionRunner});
    sinon.assert.calledWithMatch(
      FirefoxDesktopExtensionRunner, {startUrl: expectedStartUrls}
    );
  });

  it('passes the expected parameters to the extension runner', async () => {
    const cmd = prepareRun();
    const runOptions = {
      preInstall: true,
      keepProfileChanges: true,
      browserConsole: true,
      firefox: '/path/to/custom/bin/firefox',
      pref: {'my.custom.pref': 'value'},
      firefoxProfile: '/path/to/custom/profile',
    };

    const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);

    await cmd.run(runOptions, {FirefoxDesktopExtensionRunner});

    assert.ok(FirefoxDesktopExtensionRunner.called);
    const runnerParams = FirefoxDesktopExtensionRunner.firstCall.args[0];

    // The runner should receive the same parameters as the options sent
    // to run() with just a few minor adjustments.
    const expectedRunnerParams = { ...runOptions };
    expectedRunnerParams.firefoxBinary = runOptions.firefox;
    delete expectedRunnerParams.firefox;
    expectedRunnerParams.customPrefs = runOptions.pref;
    delete expectedRunnerParams.pref;

    assert.deepEqual({
      preInstall: runnerParams.preInstall,
      keepProfileChanges: runnerParams.keepProfileChanges,
      browserConsole: runnerParams.browserConsole,
      firefoxBinary: runnerParams.firefoxBinary,
      customPrefs: runnerParams.customPrefs,
      firefoxProfile: runnerParams.profilePath,
    }, expectedRunnerParams);
    assert.equal(runnerParams.extensions.length, 1);
    assert.equal(runnerParams.extensions[0].sourceDir, cmd.argv.sourceDir);
  });

  it('passes the expected dependencies to the extension runner', async () => {
    const cmd = prepareRun();
    const {firefoxApp, firefoxClient} = cmd.options;
    const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);

    await cmd.run({}, {FirefoxDesktopExtensionRunner});
    assert.ok(FirefoxDesktopExtensionRunner.called);
    const runnerParams = FirefoxDesktopExtensionRunner.firstCall.args[0];
    assert.deepEqual({
      firefoxApp: runnerParams.firefoxApp,
      firefoxClient: runnerParams.firefoxClient,
    }, {firefoxApp, firefoxClient});
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

  it('can disable input in the reload strategy', async () => {
    const cmd = prepareRun();
    const {reloadStrategy} = cmd.options;

    await cmd.run({noInput: true, noReload: false});
    sinon.assert.calledWithMatch(reloadStrategy, {noInput: true});
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

  it('allows to replace manifest parser', async () => {
    const cmd = prepareRun();
    const getFakeManifest = sinon.spy();

    await cmd.run({}, { getValidatedManifest: getFakeManifest });
    assert.equal(getFakeManifest.called, true);
  });

  it('returns ExtensonRunner', async () => {
    const cmd = prepareRun();
    const extensionRunner = await cmd.run();
    assert.instanceOf(extensionRunner, FakeExtensionRunner);
  });

  it('allows to lint ', () => {
    const cmd = prepareRun();
    const {sourceDir, artifactsDir} = cmd.argv;
    const {linter} = cmd.options;
    const ignoreFiles = undefined;

    return cmd.run({lint: true}).then(() => {
      assert.ok(linter.called);
      assert.deepEqual(linter.firstCall.args[0],
                       {sourceDir, artifactsDir, ignoreFiles});
    });
  });

  it('creates a Firefox Desktop runner if targets is an empty array',
     async () => {
       const cmd = prepareRun();
       const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);
       await cmd.run({target: []}, {FirefoxDesktopExtensionRunner});
       sinon.assert.calledOnce(FirefoxDesktopExtensionRunner);
     });

  it('creates a Firefox Desktop runner if "firefox-desktop" is in target',
     async () => {
       const cmd = prepareRun();
       const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);
       await cmd.run({target: ['firefox-desktop']}, {
         FirefoxDesktopExtensionRunner,
       });
       sinon.assert.calledOnce(FirefoxDesktopExtensionRunner);
     });

  it('creates a Firefox Android runner if "firefox-android" is in target',
     async () => {
       const cmd = prepareRun();
       const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);
       const FirefoxAndroidExtensionRunner = sinon.spy(FakeExtensionRunner);
       await cmd.run({target: ['firefox-android']}, {
         FirefoxDesktopExtensionRunner,
         FirefoxAndroidExtensionRunner,
       });

       sinon.assert.calledOnce(FirefoxAndroidExtensionRunner);
       sinon.assert.notCalled(FirefoxDesktopExtensionRunner);
     });

  it('creates multiple extension runners', async () => {
    const cmd = prepareRun();
    const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);
    const FirefoxAndroidExtensionRunner = sinon.spy(FakeExtensionRunner);
    await cmd.run({target: ['firefox-android', 'firefox-desktop']}, {
      FirefoxDesktopExtensionRunner,
      FirefoxAndroidExtensionRunner,
    });

    sinon.assert.calledOnce(FirefoxAndroidExtensionRunner);
    sinon.assert.calledOnce(FirefoxDesktopExtensionRunner);
  });

  it('provides a buildSourceDir method to the Firefox Android runner',
     async () => {
       const cmd = prepareRun();
       const FirefoxDesktopExtensionRunner = sinon.spy(FakeExtensionRunner);
       const FirefoxAndroidExtensionRunner = sinon.spy(FakeExtensionRunner);
       await cmd.run({target: ['firefox-android']}, {
         FirefoxDesktopExtensionRunner,
         FirefoxAndroidExtensionRunner,
       });

       sinon.assert.calledWithMatch(
         FirefoxAndroidExtensionRunner,
         {
           buildSourceDir: sinon.match.func,
         }
       );

       const {buildSourceDir} = FirefoxAndroidExtensionRunner.firstCall.args[0];

       await buildSourceDir('/fake/source/dir');

       sinon.assert.calledWithMatch(
         cmd.options.buildExtension,
         {
           sourceDir: '/fake/source/dir',
         },
       );
     });
});

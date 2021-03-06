/* @flow */
import path from 'path';

import { fs } from 'mz';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import run from '../../../src/cmd/run';
import {UsageError} from '../../../src/errors';
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
    MultiExtensionRunner: sinon.spy(FakeExtensionRunner),
    desktopNotifications: sinon.spy(() => {}),
  };

  return {
    argv,
    options,
    run: (customArgv = {}, customOpt = {}) =>
      // $FlowIgnore: allow use of inexact object literal for testing purpose.
      run({...argv, ...customArgv}, {...options, ...customOpt}),
  };
}

describe('run', () => {
  let androidRunnerStub: any;
  let desktopRunnerStub: any;
  let chromiumRunnerStub: any;

  beforeEach(() => {
    androidRunnerStub = sinon.stub(
      // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
      require('../../../src/extension-runners/firefox-android'),
      'FirefoxAndroidExtensionRunner');

    desktopRunnerStub = sinon.stub(
      // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
      require('../../../src/extension-runners/firefox-desktop'),
      'FirefoxDesktopExtensionRunner');

    chromiumRunnerStub = sinon.stub(
      // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
      require('../../../src/extension-runners/chromium'),
      'ChromiumExtensionRunner');
  });
  afterEach(() => {
    androidRunnerStub.restore();
    androidRunnerStub = undefined;
    desktopRunnerStub.restore();
    desktopRunnerStub = undefined;
    chromiumRunnerStub.restore();
    chromiumRunnerStub = undefined;
  });

  it('passes a custom Firefox binary when specified', async () => {
    const firefox = '/pretend/path/to/Firefox/firefox-bin';
    const cmd = prepareRun();
    await cmd.run({firefox});
    sinon.assert.calledWithMatch(desktopRunnerStub, {firefoxBinary: firefox});
  });

  it('passes startUrl parameter to Firefox when specified', async () => {
    const cmd = prepareRun();
    const expectedStartUrls = ['www.example.com'];

    await cmd.run({startUrl: expectedStartUrls});
    sinon.assert.calledWithMatch(
      desktopRunnerStub, {startUrl: expectedStartUrls}
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
      args: ['-headless=false'],
    };

    await cmd.run(runOptions);

    sinon.assert.calledOnce(desktopRunnerStub);
    const runnerParams = desktopRunnerStub.firstCall.args[0];

    // The runner should receive the same parameters as the options sent
    // to run() with just a few minor adjustments.
    const expectedRunnerParams = {
      ...runOptions,
      firefoxBinary: runOptions.firefox,
      customPrefs: runOptions.pref,
    };
    // $FlowIgnore: Allow deleting properties for testing purpose.
    delete expectedRunnerParams.firefox;
    // $FlowIgnore: Allow deleting properties for testing purpose.
    delete expectedRunnerParams.pref;

    assert.deepEqual({
      preInstall: runnerParams.preInstall,
      keepProfileChanges: runnerParams.keepProfileChanges,
      browserConsole: runnerParams.browserConsole,
      firefoxBinary: runnerParams.firefoxBinary,
      customPrefs: runnerParams.customPrefs,
      firefoxProfile: runnerParams.profilePath,
      args: runnerParams.args,
    }, expectedRunnerParams);
    assert.equal(runnerParams.extensions.length, 1);
    assert.equal(runnerParams.extensions[0].sourceDir, cmd.argv.sourceDir);
  });

  it('passes the expected dependencies to the extension runner', async () => {
    const cmd = prepareRun();
    const {firefoxApp, firefoxClient} = cmd.options;

    await cmd.run({});
    sinon.assert.calledOnce(desktopRunnerStub);
    const runnerParams = desktopRunnerStub.firstCall.args[0];
    assert.deepEqual({
      firefoxApp: runnerParams.firefoxApp,
      firefoxClient: runnerParams.firefoxClient,
    }, {firefoxApp, firefoxClient});
  });

  it('throws if watchFile is not an array', async () => {
    const cmd = prepareRun();
    await assert.isRejected(
      cmd.run({noReload: false, watchFile: 'invalid-value.txt' }),
      /Unexpected watchFile type/
    );
  });

  it('can watch and reload the extension', async () => {
    const cmd = prepareRun();
    const {sourceDir, artifactsDir} = cmd.argv;
    const {reloadStrategy} = cmd.options;

    const watchFile = [
      fixturePath('minimal-web-ext', 'manifest.json'),
    ];

    await cmd.run({noReload: false, watchFile });
    assert.equal(reloadStrategy.called, true);
    const args = reloadStrategy.firstCall.args[0];
    assert.equal(args.sourceDir, sourceDir);
    assert.equal(args.artifactsDir, artifactsDir);
    assert.equal(args.watchFile, watchFile);
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

  it('creates a Firefox Desktop runner if targets is an empty array',
     async () => {
       const cmd = prepareRun();
       await cmd.run({target: []});
       sinon.assert.notCalled(androidRunnerStub);
       sinon.assert.calledOnce(desktopRunnerStub);
     });

  it('creates a Firefox Desktop runner if "firefox-desktop" is in target',
     async () => {
       const cmd = prepareRun();
       await cmd.run({target: ['firefox-desktop']});
       sinon.assert.notCalled(androidRunnerStub);
       sinon.assert.calledOnce(desktopRunnerStub);
     });

  it('creates a Firefox Android runner if "firefox-android" is in target',
     async () => {
       const cmd = prepareRun();
       await cmd.run({
         target: ['firefox-android'],
         firefoxApkComponent: 'CustomView',
       });

       sinon.assert.calledOnce(androidRunnerStub);
       const options = androidRunnerStub.firstCall.args[0];
       assert.equal(options.firefoxApkComponent, 'CustomView');
       sinon.assert.notCalled(desktopRunnerStub);
     });

  it('creates a Chromium runner if "chromium" is in target',
     async () => {
       const cmd = prepareRun();
       await cmd.run({target: ['chromium']});

       sinon.assert.calledOnce(chromiumRunnerStub);
       sinon.assert.notCalled(androidRunnerStub);
       sinon.assert.notCalled(desktopRunnerStub);
     });

  it('provides a chromiumBinary option to the Chromium runner',
     async () => {
       const fakeChromiumBinary = '/bin/fake-chrome/binary';
       const cmd = prepareRun();
       await cmd.run({
         target: ['chromium'],
         chromiumBinary: fakeChromiumBinary,
       });

       sinon.assert.calledWithMatch(
         chromiumRunnerStub,
         {
           chromiumBinary: sinon.match.string,
         }
       );

       const {chromiumBinary} = chromiumRunnerStub.firstCall.args[0];
       assert.equal(chromiumBinary, fakeChromiumBinary,
                    'Got the expected chromiumBinary option');
     });

  it('provides a chromiumProfile option to the Chromium runner',
     async () => {
       const fakeChromiumProfile = '/fake/chrome/profile';
       const cmd = prepareRun();
       await cmd.run({
         target: ['chromium'],
         chromiumProfile: fakeChromiumProfile,
       });

       sinon.assert.calledWithMatch(
         chromiumRunnerStub,
         {
           chromiumProfile: sinon.match.string,
         }
       );

       const {chromiumProfile} = chromiumRunnerStub.firstCall.args[0];
       assert.equal(chromiumProfile, fakeChromiumProfile,
                    'Got the expected chromiumProfile option');
     });

  it('creates multiple extension runners', async () => {
    const cmd = prepareRun();
    await cmd.run({target: ['firefox-android', 'firefox-desktop']});

    sinon.assert.calledOnce(androidRunnerStub);
    sinon.assert.calledOnce(desktopRunnerStub);
  });

  it('provides a buildSourceDir method to the Firefox Android runner',
     async () => {
       const cmd = prepareRun();
       await cmd.run({target: ['firefox-android']});

       sinon.assert.calledWithMatch(
         androidRunnerStub,
         {
           buildSourceDir: sinon.match.func,
         }
       );

       const {buildSourceDir} = androidRunnerStub.firstCall.args[0];

       await buildSourceDir('/fake/source/dir');

       sinon.assert.calledWithMatch(
         cmd.options.buildExtension,
         {
           sourceDir: '/fake/source/dir',
         },
       );
     });

  describe('profile-create-new option', () => {
    beforeEach(() => {
      sinon.stub(fs, 'mkdir');
      sinon.stub(fs, 'existsSync');
    });

    afterEach(() => {
      fs.mkdir.restore();
      fs.existsSync.restore();
    });

    const fakeProfile = '/pretend/path/to/profile';

    async function testCreateProfileIfMissing(
      expectProfileExists,
      runParams
    ) {
      fs.existsSync.returns(expectProfileExists);
      const cmd = prepareRun();

      await cmd.run(runParams);

      if (expectProfileExists) {
        sinon.assert.notCalled(fs.mkdir);
      } else {
        sinon.assert.calledWith(fs.mkdir, fakeProfile);
      }

      if (runParams.target === 'chromium') {
        sinon.assert.calledOnce(chromiumRunnerStub);

        const {chromiumProfile} = chromiumRunnerStub.firstCall.args[0];
        assert.equal(chromiumProfile, fakeProfile,
                     'Got the expected chromiumProfile option');
      } else {
        sinon.assert.calledOnce(desktopRunnerStub);
        const firefoxProfile = desktopRunnerStub
          .firstCall
          .args[0]
          .profilePath;
        assert.equal(firefoxProfile, fakeProfile,
                     'Got the expected firefoxProfile option');
      }
    }

    it('creates dir when firefox profile does not exist',
       async () => testCreateProfileIfMissing(
         false, {
           firefoxProfile: fakeProfile,
           profileCreateIfMissing: true,
         })
    );

    it('creates dir when chromium profile does not exist',
       async () => testCreateProfileIfMissing(
         false, {
           chromiumProfile: fakeProfile,
           target: 'chromium',
           profileCreateIfMissing: true,
         })
    );

    it('uses the given firefox profile directory if it does exist',
       async () => testCreateProfileIfMissing(
         true, {
           firefoxProfile: fakeProfile,
           profileCreateIfMissing: true,
         })
    );

    it('uses the given chromium profile directory if it does exist',
       async () => testCreateProfileIfMissing(
         true, {
           chromiumProfile: fakeProfile,
           target: 'chromium',
           profileCreateIfMissing: true,
         })
    );

    it('throws error when used without firefox-profile or chromium-profile',
       async () => {
         const cmd = prepareRun();
         const promise = cmd.run({ profileCreateIfMissing: true });

         await assert.isRejected(promise, UsageError);
         await assert.isRejected(
           promise,
           /requires --firefox-profile or --chromium-profile/
         );
       });
  });
});

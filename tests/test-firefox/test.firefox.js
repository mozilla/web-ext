import path from 'path';
import {assert} from 'chai';
import deepcopy from 'deepcopy';
import sinon from 'sinon';
import FirefoxProfile from 'firefox-profile';

import {onlyInstancesOf, WebExtError} from '../../src/errors';
import fs from 'mz/fs';
import {withTempDir} from '../../src/util/temp-dir';
import {fixturePath, makeSureItFails} from '../helpers';
import {basicManifest} from '../test-util/test.manifest';
import {defaultFirefoxEnv} from '../../src/firefox/';
import * as adapter from './adapter';


describe('firefox', () => {

  describe('run', () => {

    const fakeProfile = {
      path: () => '/dev/null/some-profile-path',
    };

    const fakeFirefoxProcess = {
      on: (eventName, callback) => {
        if (eventName === 'close') {
          // Immediately "emit" a close event to complete the test.
          callback();
        }
      },
      stdout: {on: () => {}},
      stderr: {on: () => {}},
    };

    function createFakeFxRunner(firefoxOverrides={}) {
      let firefox = {
        ...deepcopy(fakeFirefoxProcess),
        ...firefoxOverrides,
      };
      return sinon.spy(() => Promise.resolve({
        args: [],
        process: firefox,
      }));
    }

    it('executes the Firefox runner with a given profile', () => {
      let runner = createFakeFxRunner();
      return adapter.run(fakeProfile, runner)
        .then(() => {
          assert.equal(runner.called, true);
          assert.equal(runner.firstCall.args[0].profile,
                       fakeProfile.path());
        });
    });

    it('sets up a Firefox process environment', () => {
      let runner = createFakeFxRunner();
      // Make sure it passes through process environment variables.
      process.env._WEB_EXT_FIREFOX_ENV_TEST = 'thing';
      return adapter.run(fakeProfile, runner)
        .then(() => {
          let declaredEnv = runner.firstCall.args[0].env;
          for (let key in defaultFirefoxEnv) {
            assert.equal(declaredEnv[key], defaultFirefoxEnv[key]);
          }
          assert.equal(declaredEnv._WEB_EXT_FIREFOX_ENV_TEST, 'thing');
        });
    });

    it('fails on a firefox error', () => {
      let someError = new Error('some internal firefox error');
      let runner = createFakeFxRunner({
        on: (eventName, callback) => {
          if (eventName === 'error') {
            // Immediately "emit" an error event.
            callback(someError);
          }
        },
      });

      return adapter.run(fakeProfile, runner)
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(error.message, someError.message);
        });
    });

  });

  describe('createProfile', () => {

    it('resolves with a profile object', () => {
      return adapter.createDefaultProfile(sinon.stub().returns({}))
        .then((profile) => {
          assert.instanceOf(profile, FirefoxProfile);
        });
    });

    it('writes a Firefox profile', () => {
      // This is a quick and paranoid sanity check that the FirefoxProfile
      // object is working as expected.
      return adapter.createProfile()
        .then((profile) => fs.readFile(path.join(profile.path(), 'user.js')))
        .then((prefFile) => {
          assert.include(prefFile.toString(),
                         '"devtools.debugger.remote-enabled", true');
        });
    });

    it('can create a Firefox profile with some defaults', () => {
      let fakePrefGetter = sinon.stub().returns({});
      return adapter.createDefaultProfile(fakePrefGetter)
        .then(() => {
          assert.equal(fakePrefGetter.firstCall.args[0], 'firefox');
        });
    });

    it('can create a Fennec profile with some defaults', () => {
      let fakePrefGetter = sinon.stub().returns({});
      return adapter.createFennecProfile(fakePrefGetter)
        .then(() => {
          assert.equal(fakePrefGetter.firstCall.args[0], 'fennec');
        });
    });

  });

  describe('installExtension', () => {

    function setUp(testPromise) {
      return withTempDir(
        (tmpDir) => {
          let data = {
            extensionPath: fixturePath('minimal_extension-1.0.xpi'),
            profile: undefined,
            profileDir: path.join(tmpDir.path(), 'profile'),
          };
          return fs.mkdir(data.profileDir)
            .then(() => {
              data.profile = new FirefoxProfile({
                destinationDirectory: data.profileDir,
              });
            })
            .then(() => testPromise(data));
        });
    }

    it('installs an extension file into a profile', () => setUp(
      (data) => {
        return adapter.installExtension(basicManifest, data.profile,
                                        data.extensionPath)
          .then(() => fs.readdir(data.profile.extensionsDir))
          .then((files) => {
            assert.deepEqual(
              files, ['basic-manifest@web-ext-test-suite.xpi']);
          });
      }
    ));

    it('re-uses an existing extension directory', () => setUp(
      (data) => {
        return fs.mkdir(path.join(data.profile.extensionsDir))
          .then(() => adapter.installExtension(basicManifest,
                                               data.profile,
                                               data.extensionPath))
          .then(() => fs.stat(data.profile.extensionsDir));
      }
    ));

    it('checks for an empty extensionsDir', () => setUp(
      (data) => {
        data.profile.extensionsDir = undefined;
        return adapter.installExtension(basicManifest,
                                        data.profile,
                                        data.extensionPath)
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message, /unexpectedly empty/);
          }));
      }
    ));

  });

});

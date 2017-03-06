/* @flow */
import path from 'path';

import deepcopy from 'deepcopy';
import sinon from 'sinon';
import FirefoxProfile from 'firefox-profile';
import {describe, it} from 'mocha';
import {assert} from 'chai';
import {fs} from 'mz';

import * as firefox from '../../../src/firefox';
import {onlyInstancesOf, UsageError, WebExtError} from '../../../src/errors';
import {withTempDir} from '../../../src/util/temp-dir';
import {TCPConnectError, fixturePath, fake, makeSureItFails} from '../helpers';
import {basicManifest, manifestWithoutApps} from '../test-util/test.manifest';
import {RemoteFirefox} from '../../../src/firefox/remote';
import type {RemotePortFinderParams} from '../../../src/firefox/index';

const {defaultFirefoxEnv} = firefox;

function withBaseProfile(callback) {
  return withTempDir(
    (tmpDir) => {
      const baseProfile = new FirefoxProfile({
        destinationDirectory: tmpDir.path(),
      });
      return callback(baseProfile);
    }
  );
}

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

    function createFakeFxRunner(firefoxOverrides = {}) {
      const fxProcess = {
        ...deepcopy(fakeFirefoxProcess),
        ...firefoxOverrides,
      };
      return sinon.spy(() => Promise.resolve({args: [], process: fxProcess}));
    }

    // TODO: This object should accept dynamic properties since those are passed to firefox.run()

    type RunFirefoxOptions = {
      profile?: typeof FirefoxProfile,
    }

    function runFirefox(
      {
        profile = fakeProfile,
        ...args
      }: RunFirefoxOptions = {},
    ) {
      return firefox.run(profile, {
        fxRunner: createFakeFxRunner(),
        findRemotePort: () => Promise.resolve(6000),
        ...args,
      });
    }

    it('executes the Firefox runner with a given profile', () => {
      const runner = createFakeFxRunner();
      const profile = fakeProfile;
      return runFirefox({fxRunner: runner, profile})
        .then(() => {
          assert.equal(runner.called, true);
          assert.equal(runner.firstCall.args[0].profile,
                       profile.path());
        });
    });

    it('starts the remote debugger on a discovered port', () => {
      const port = 6001;
      const runner = createFakeFxRunner();
      const findRemotePort = sinon.spy(() => Promise.resolve(port));
      return runFirefox({fxRunner: runner, findRemotePort})
        .then(() => {
          assert.equal(runner.called, true);
          assert.equal(runner.firstCall.args[0].listen, port);
        });
    });

    it('passes binary args to Firefox', () => {
      const fxRunner = createFakeFxRunner();
      const binaryArgs = '--safe-mode';
      return runFirefox({fxRunner, binaryArgs})
        .then(() => {
          assert.equal(fxRunner.called, true);
          assert.equal(fxRunner.firstCall.args[0]['binary-args'],
                       binaryArgs);
        });
    });

    it('sets up a Firefox process environment', () => {
      const runner = createFakeFxRunner();
      // Make sure it passes through process environment variables.
      process.env._WEB_EXT_FIREFOX_ENV_TEST = 'thing';
      return runFirefox({fxRunner: runner})
        .then(() => {
          const declaredEnv = runner.firstCall.args[0].env;
          for (const key in defaultFirefoxEnv) {
            assert.equal(declaredEnv[key], defaultFirefoxEnv[key]);
          }
          assert.equal(declaredEnv._WEB_EXT_FIREFOX_ENV_TEST, 'thing');
        });
    });

    it('fails on a firefox error', () => {
      const someError = new Error('some internal firefox error');
      const runner = createFakeFxRunner({
        on: (eventName, callback) => {
          if (eventName === 'error') {
            // Immediately "emit" an error event.
            callback(someError);
          }
        },
      });

      return runFirefox({fxRunner: runner})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(error.message, someError.message);
        });
    });

    it('passes a custom Firefox binary when specified', () => {
      const runner = createFakeFxRunner();
      const firefoxBinary = '/pretend/path/to/firefox-bin';
      return runFirefox({fxRunner: runner, firefoxBinary})
        .then(() => {
          assert.equal(runner.called, true);
          assert.equal(runner.firstCall.args[0].binary,
                       firefoxBinary);
        });
    });

    it('logs stdout and stderr without errors', () => {
      // Store a registry of handlers that we can execute directly.
      const firefoxApp = {};
      const runner = createFakeFxRunner({
        stdout: {
          on: (event, handler) => {
            firefoxApp.writeStdout = handler;
          },
        },
        stderr: {
          on: (event, handler) => {
            firefoxApp.writeStderr = handler;
          },
        },
      });

      return runFirefox({fxRunner: runner})
        .then(() => {
          // This makes sure that when each handler writes to the
          // logger they don't raise any exceptions.
          firefoxApp.writeStdout('example of stdout');
          firefoxApp.writeStderr('example of stderr');
        });
    });

  });

  describe('copyProfile', () => {

    it('copies a profile', () => withBaseProfile(
      (baseProfile) => {
        baseProfile.setPreference('webext.customSetting', true);
        baseProfile.updatePreferences();

        return firefox.copyProfile(baseProfile.path(),
          {configureThisProfile: (profile) => Promise.resolve(profile)})
          .then((profile) => fs.readFile(profile.userPrefs))
          .then((userPrefs) => {
            assert.include(userPrefs.toString(), 'webext.customSetting');
          });
      }
    ));

    it('requires a valid profile directory', () => {
      // This stubs out the code that looks for a named
      // profile because on Travis CI there will not be a Firefox
      // user directory.
      const copyFromUserProfile = sinon.spy(
        (config, cb) => cb(new Error('simulated: could not find profile')));

      return firefox.copyProfile('/dev/null/non_existent_path',
        {
          copyFromUserProfile,
          configureThisProfile: (profile) => Promise.resolve(profile),
        })
        .then(makeSureItFails())
        .catch(onlyInstancesOf(WebExtError, (error) => {
          assert.equal(copyFromUserProfile.called, true);
          assert.match(
            error.message,
            /Could not copy Firefox profile from .*non_existent_path/);
        }));
    });

    it('can copy a profile by name', () => {
      const name = 'some-fake-firefox-profile-name';
      // Fake profile object:
      const profileToCopy = {
        defaultPreferences: {
          thing: 'value',
        },
      };
      const copyFromUserProfile = sinon.spy(
        (config, callback) => callback(null, profileToCopy));

      return firefox.copyProfile(name,
        {
          copyFromUserProfile,
          configureThisProfile: (profile) => Promise.resolve(profile),
        })
        .then((profile) => {
          assert.equal(copyFromUserProfile.called, true);
          assert.equal(copyFromUserProfile.firstCall.args[0].name, name);
          assert.equal(profile.defaultPreferences.thing,
                       profileToCopy.defaultPreferences.thing);
        });
    });

    it('configures the copied profile', () => withBaseProfile(
      (baseProfile) => {
        const app = 'fennec';
        const configureThisProfile =
          sinon.spy((profile) => Promise.resolve(profile));

        return firefox.copyProfile(baseProfile.path(),
          {app, configureThisProfile})
          .then((profile) => {
            assert.equal(configureThisProfile.called, true);
            assert.equal(configureThisProfile.firstCall.args[0], profile);
            assert.equal(configureThisProfile.firstCall.args[1].app, app);
          });
      }
    ));

  });

  describe('createProfile', () => {

    it('resolves with a profile object', () => {
      return firefox.createProfile(
        {configureThisProfile: (profile) => Promise.resolve(profile)})
        .then((profile) => {
          assert.instanceOf(profile, FirefoxProfile);
        });
    });

    it('creates a Firefox profile', () => {
      // This is a quick and paranoid sanity check that the FirefoxProfile
      // object is real and has some preferences.
      return firefox.createProfile(
        {configureThisProfile: (profile) => Promise.resolve(profile)})
        .then((profile) => {
          profile.updatePreferences();
          return fs.readFile(path.join(profile.path(), 'user.js'));
        })
        .then((prefFile) => {
          // Check for some default pref set by FirefoxProfile.
          assert.include(prefFile.toString(),
                         '"startup.homepage_welcome_url", "about:blank"');
        });
    });

    it('configures a profile', () => {
      const configureThisProfile =
        sinon.spy((profile) => Promise.resolve(profile));
      const app = 'fennec';
      return firefox.createProfile({app, configureThisProfile})
        .then((profile) => {
          assert.equal(configureThisProfile.called, true);
          assert.equal(configureThisProfile.firstCall.args[0], profile);
          assert.equal(configureThisProfile.firstCall.args[1].app, app);
        });
    });

  });

  describe('useProfile', () => {

    it('resolves to a FirefoxProfile instance', () => withBaseProfile(
      (baseProfile) => {
        const configureThisProfile = (profile) => Promise.resolve(profile);
        return firefox.useProfile(baseProfile.path(), {configureThisProfile})
          .then((profile) => {
            assert.instanceOf(profile, FirefoxProfile);
          });
      }
    ));

    it('configures a profile', () => withBaseProfile(
      (baseProfile) => {
        const configureThisProfile =
          sinon.spy((profile) => Promise.resolve(profile));
        const app = 'fennec';
        const profilePath = baseProfile.path();
        return firefox.useProfile(profilePath, {app, configureThisProfile})
          .then((profile) => {
            assert.equal(configureThisProfile.called, true);
            assert.equal(configureThisProfile.firstCall.args[0], profile);
            assert.equal(configureThisProfile.firstCall.args[1].app, app);
          });
      }
    ));

  });

  describe('configureProfile', () => {

    function withTempProfile(callback) {
      return withTempDir((tmpDir) => {
        const profile = new FirefoxProfile({
          destinationDirectory: tmpDir.path(),
        });
        return callback(profile);
      });
    }

    it('resolves with a profile', () => withTempProfile(
      (profile) => {
        const fakePrefGetter = sinon.stub().returns({});
        return firefox.configureProfile(profile, {getPrefs: fakePrefGetter})
          .then((configuredProfile) => {
            assert.instanceOf(configuredProfile, FirefoxProfile);
          });
      }
    ));

    it('sets Firefox preferences', () => withTempProfile(
      (profile) => {
        const fakePrefGetter = sinon.stub().returns({});
        return firefox.configureProfile(profile, {getPrefs: fakePrefGetter})
          .then(() => {
            assert.equal(fakePrefGetter.firstCall.args[0], 'firefox');
          });
      }
    ));

    it('sets Fennec preferences', () => withTempProfile(
      (profile) => {
        const fakePrefGetter = sinon.stub().returns({});
        return firefox.configureProfile(
          profile, {
            getPrefs: fakePrefGetter,
            app: 'fennec',
          })
          .then(() => {
            assert.equal(fakePrefGetter.firstCall.args[0], 'fennec');
          });
      }
    ));

    it('writes new preferences', () => withTempProfile(
      (profile) => {
        // This is a quick sanity check that real preferences were
        // written to disk.
        return firefox.configureProfile(profile)
          .then((configuredProfile) => {
            return fs.readFile(path.join(configuredProfile.path(), 'user.js'));
          })
          .then((prefFile) => {
            // Check for some pref set by configureProfile().
            assert.include(prefFile.toString(),
                           '"devtools.debugger.remote-enabled", true');
          });
      }
    ));

    it('writes custom preferences', () => withTempProfile(
      (profile) => {
        const customPrefs = {'extensions.checkCompatibility.nightly': true};
        return firefox.configureProfile(profile, {customPrefs})
          .then((configuredProfile) => {
            return fs.readFile(path.join(configuredProfile.path(), 'user.js'));
          })
          .then((prefFile) => {
            // Check for custom pref set by configureProfile().
            assert.include(prefFile.toString(),
                           '"extensions.checkCompatibility.nightly", true');
            // Check that one of the default preferences is set as well
            assert.include(prefFile.toString(),
                           '"devtools.debugger.remote-enabled", true');
          });
      }
    ));

  });

  describe('installExtension', () => {

    function setUp(testPromise: Function) {
      return withTempDir(
        (tmpDir) => {
          const data = {
            extensionPath: fixturePath('minimal_extension-1.0.zip'),
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

    function installBasicExt(data) {
      return firefox.installExtension({
        manifestData: basicManifest,
        profile: data.profile,
        extensionPath: data.extensionPath,
      });
    }

    it('installs an extension file into a profile', () => setUp(
      (data) => {
        return installBasicExt(data)
          .then(() => fs.readdir(data.profile.extensionsDir))
          .then((files) => {
            assert.deepEqual(
              files, ['basic-manifest@web-ext-test-suite.xpi']);
          });
      }
    ));

    it('requires a manifest ID', () => setUp(
      (data) => {
        return firefox.installExtension(
          {
            manifestData: manifestWithoutApps,
            profile: data.profile,
            extensionPath: data.extensionPath,
          })
          .then(makeSureItFails())
          .catch(onlyInstancesOf(UsageError, (error) => {
            assert.match(error.message,
                         /explicit extension ID is required/);
          }));
      }
    ));

    it('can install the extension as a proxy', () => setUp(
      (data) => {
        const sourceDir = fixturePath('minimal-web-ext');
        return firefox.installExtension(
          {
            manifestData: basicManifest,
            profile: data.profile,
            extensionPath: sourceDir,
            asProxy: true,
          })
          .then(() => {
            const proxyFile = path.join(data.profile.extensionsDir,
                                        'basic-manifest@web-ext-test-suite');
            return fs.readFile(proxyFile);
          })
          .then((proxyData) => {
            // The proxy file should contain the path to the extension.
            assert.equal(proxyData.toString(), sourceDir);
          });
      }
    ));

    it('requires a directory path for proxy installs', () => setUp(
      (data) => {
        const extensionPath = fixturePath('minimal_extension-1.0.zip');
        return firefox.installExtension(
          {
            manifestData: basicManifest,
            profile: data.profile,
            extensionPath,
            asProxy: true,
          })
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message,
                         /must be the extension source directory/);
            assert.include(error.message, extensionPath);
          }));
      }
    ));

    it('re-uses an existing extension directory', () => setUp(
      (data) => {
        return fs.mkdir(path.join(data.profile.extensionsDir))
          .then(() => installBasicExt(data))
          .then(() => fs.stat(data.profile.extensionsDir));
      }
    ));

    it('checks for an empty extensionsDir', () => setUp(
      (data) => {
        data.profile.extensionsDir = undefined;
        return installBasicExt(data)
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message, /unexpectedly empty/);
          }));
      }
    ));

  });

  describe('defaultRemotePortFinder', () => {

    function findRemotePort({...args}: RemotePortFinderParams = {}) {
      return firefox.defaultRemotePortFinder({...args});
    }

    it('resolves to an open port', () => {
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new TCPConnectError()));
      return findRemotePort({connectToFirefox})
        .then((port) => {
          assert.isNumber(port);
        });
    });

    it('returns a port on first try', () => {
      const connectToFirefox = sinon.spy(() => new Promise(
        (resolve, reject) => {
          reject(
            new TCPConnectError('first call connection fails - port is free')
          );
        }));
      return findRemotePort({connectToFirefox, retriesLeft: 2})
        .then((port) => {
          assert.equal(connectToFirefox.callCount, 1);
          assert.isNumber(port);
        });
    });

    it('cancels search after too many fails', () => {
      const client = fake(RemoteFirefox.prototype);
      const connectToFirefox = sinon.spy(() => new Promise(
        (resolve) => resolve(client)));
      return findRemotePort({connectToFirefox, retriesLeft: 2})
        .catch((err) => {
          assert.equal(err, 'WebExtError: Too many retries on port search');
          assert.equal(connectToFirefox.callCount, 3);
        });
    });

    it('retries port discovery after first failure', () => {
      const client = fake(RemoteFirefox.prototype);
      let callCount = 0;
      const connectToFirefox = sinon.spy(() => {
        callCount++;
        return new Promise((resolve, reject) => {
          if (callCount === 2) {
            reject(new TCPConnectError('port is free'));
          } else {
            resolve(client);
          }
        });
      });
      return findRemotePort({connectToFirefox, retriesLeft: 2})
        .then((port) => {
          assert.isNumber(port);
          assert.equal(connectToFirefox.callCount, 2);
        });
    });

  });
});

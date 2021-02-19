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
import {
  basicManifest,
  fixturePath,
  makeSureItFails,
  manifestWithoutApps,
  ErrorWithCode,
} from '../helpers';

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

function createFakeProfileFinder(profilesDirPath) {
  const FakeProfileFinder = sinon.spy((...args) => {
    const finder = new FirefoxProfile.Finder(...args);

    sinon.spy(finder, 'readProfiles');

    return finder;
  });

  FakeProfileFinder.locateUserDirectory = sinon.spy(() => {
    return profilesDirPath;
  });

  return FakeProfileFinder;
}

async function createFakeProfilesIni(
  dirPath: string, profilesDefs: Array<Object>
): Promise<void> {
  let content = '';

  for (const [idx, profile] of profilesDefs.entries()) {
    content += `[Profile${idx}]\n`;
    for (const k of Object.keys(profile)) {
      content += `${k}=${profile[k]}\n`;
    }
    content += '\n';
  }

  await fs.writeFile(path.join(dirPath, 'profiles.ini'), content);
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
        // $FlowIgnore: for the purpose of this test, fakeProfile includes only a subset of the expected properties.
        profile = fakeProfile,
        ...args
      }: RunFirefoxOptions = {},
    ) {
      // $FlowIgnore: allow use of inexact object literal for testing purpose.
      return firefox.run(profile, {
        fxRunner: createFakeFxRunner(),
        findRemotePort: () => Promise.resolve(6000),
        ...args,
      });
    }

    it('executes the Firefox runner with a given profile', () => {
      const runner = createFakeFxRunner();
      const profile = fakeProfile;
      // $FlowIgnore: allow use of fakeProfile as a fake FirefoxProfile instance.
      return runFirefox({fxRunner: runner, profile})
        .then(() => {
          sinon.assert.called(runner);
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
          sinon.assert.called(runner);
          assert.equal(runner.firstCall.args[0].listen, port);
        });
    });

    it('passes binary args to Firefox', () => {
      const fxRunner = createFakeFxRunner();
      const binaryArgs = '--safe-mode';
      return runFirefox({fxRunner, binaryArgs})
        .then(() => {
          sinon.assert.called(fxRunner);
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
          sinon.assert.called(runner);
          sinon.assert.calledWithMatch(runner, {binary: firefoxBinary});
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

        return firefox.copyProfile(baseProfile.path(), {
          configureThisProfile: (profile) => Promise.resolve(profile),
        })
          .then((profile) => fs.readFile(profile.userPrefs))
          .then((userPrefs) => {
            assert.include(userPrefs.toString(), 'webext.customSetting');
          });
      }
    ));

    it('requires a valid profile directory', () => {
      // This stubs out the code that looks for a named
      // profile because on CI there will not be a Firefox
      // user directory.
      const copyFromUserProfile = sinon.spy(
        (config, cb) => cb(new Error('simulated: could not find profile')));

      return firefox.copyProfile(
        '/dev/null/non_existent_path',
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

      return firefox.copyProfile(
        name,
        {
          copyFromUserProfile,
          configureThisProfile: (profile) => Promise.resolve(profile),
        })
        .then((profile) => {
          sinon.assert.called(copyFromUserProfile);
          sinon.assert.calledWithMatch(copyFromUserProfile, {name});
          assert.equal(profile.defaultPreferences.thing,
                       profileToCopy.defaultPreferences.thing);
        });
    });

    it('configures the copied profile', () => withBaseProfile(
      (baseProfile) => {
        const app = 'fennec';
        const configureThisProfile =
          sinon.spy((profile) => Promise.resolve(profile));

        return firefox.copyProfile(baseProfile.path(), {
          app, configureThisProfile,
        })
          .then((profile) => {
            sinon.assert.called(configureThisProfile);
            sinon.assert.calledWith(configureThisProfile, profile);
            assert.equal(configureThisProfile.firstCall.args[1].app, app);
          });
      }
    ));

  });

  describe('isDefaultProfile', () => {

    it('detects common Firefox default profiles specified by name',
       async () => {
         const isDefault = await firefox.isDefaultProfile('default');
         assert.equal(isDefault, true);

         const isDevEditionDefault = await firefox.isDefaultProfile(
           'dev-edition-default'
         );
         assert.equal(isDevEditionDefault, true);
       });

    it('allows profile name if it is not listed as default in profiles.ini',
       async () => {
         return withTempDir(async (tmpDir) => {
           const profilesDirPath = tmpDir.path();
           const FakeProfileFinder = createFakeProfileFinder(profilesDirPath);

           await createFakeProfilesIni(profilesDirPath, [
             {
               Name: 'manually-set-default',
               Path: 'fake-default-profile',
               IsRelative: 1,
               Default: 1,
             },
           ]);

           const isDefault = await firefox.isDefaultProfile(
             'manually-set-default', FakeProfileFinder
           );
           assert.equal(
             isDefault, true,
             'Manually configured default profile'
           );

           const isNotDefault = await firefox.isDefaultProfile(
             'unkown-profile-name', FakeProfileFinder
           );
           assert.equal(
             isNotDefault, false,
             'Unknown profile name'
           );
         });
       });

    it('allows profile path if it is not listed as default in profiles.ini',
       async () => {
         return withTempDir(async (tmpDir) => {
           const profilesDirPath = tmpDir.path();
           const FakeProfileFinder = createFakeProfileFinder(profilesDirPath);
           const absProfilePath = path.join(
             profilesDirPath,
             'fake-manually-default-profile'
           );

           await createFakeProfilesIni(profilesDirPath, [
             {
               Name: 'default',
               Path: 'fake-default-profile',
               IsRelative: 1,
             },
             {
               Name: 'dev-edition-default',
               Path: 'fake-devedition-default-profile',
               IsRelative: 1,
             },
             {
               Name: 'manually-set-default',
               Path: absProfilePath,
               Default: 1,
             },
           ]);

           const isFirefoxDefaultPath = await firefox.isDefaultProfile(
             path.join(profilesDirPath, 'fake-default-profile'),
             FakeProfileFinder
           );
           assert.equal(
             isFirefoxDefaultPath, true,
             'Firefox default profile'
           );

           const isDevEditionDefaultPath = await firefox.isDefaultProfile(
             path.join(profilesDirPath, 'fake-devedition-default-profile'),
             FakeProfileFinder
           );
           assert.equal(
             isDevEditionDefaultPath, true,
             'Firefox DevEdition default profile'
           );

           const isManuallyDefault = await firefox.isDefaultProfile(
             absProfilePath,
             FakeProfileFinder
           );
           assert.equal(
             isManuallyDefault, true,
             'Manually configured default profile'
           );

           const isNotDefault = await firefox.isDefaultProfile(
             path.join(profilesDirPath, 'unkown-profile-dir'),
             FakeProfileFinder
           );
           assert.equal(
             isNotDefault, false,
             'Unknown profile path'
           );
         });
       });

    it('allows profile path if there is no profiles.ini file',
       async () => {
         return withTempDir(async (tmpDir) => {
           const profilesDirPath = tmpDir.path();
           const FakeProfileFinder = createFakeProfileFinder(profilesDirPath);

           const isNotDefault = await firefox.isDefaultProfile(
             '/tmp/my-custom-profile-dir',
             FakeProfileFinder
           );

           assert.equal(isNotDefault, false);
         });
       });

    it('rejects on any unexpected error while looking for profiles.ini',
       async () => {
         return withTempDir(async (tmpDir) => {
           const profilesDirPath = tmpDir.path();
           const FakeProfileFinder = createFakeProfileFinder(profilesDirPath);
           const fakeFsStat = sinon.spy(() => {
             return Promise.reject(new Error('Fake fs stat error'));
           });

           let exception;
           try {
             await firefox.isDefaultProfile(
               '/tmp/my-custom-profile-dir',
               FakeProfileFinder,
               fakeFsStat
             );
           } catch (error) {
             exception = error;
           }

           assert.match(exception && exception.message, /Fake fs stat error/);
         });
       }
    );

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
          sinon.assert.called(configureThisProfile);
          sinon.assert.calledWith(configureThisProfile, profile);
          assert.equal(configureThisProfile.firstCall.args[1].app, app);
        });
    });

  });

  describe('useProfile', () => {
    it('rejects to a UsageError when used on a default Firefox profile',
       async () => {
         const configureThisProfile = sinon.spy(
           (profile) => Promise.resolve(profile)
         );
         const isFirefoxDefaultProfile = sinon.spy(
           () => Promise.resolve(true)
         );
         let exception;

         try {
           await firefox.useProfile('default', {
             configureThisProfile,
             isFirefoxDefaultProfile,
           });
         } catch (error) {
           exception = error;
         }
         assert.instanceOf(exception, UsageError);
         assert.match(
           exception && exception.message,
           /Cannot use --keep-profile-changes on a default profile/
         );
       });

    it('rejects to a UsageError when profile is not found',
       async () => {
         const fakeGetProfilePath = sinon.spy(() => Promise.resolve(false));
         const createProfileFinder = () => {
           return fakeGetProfilePath;
         };
         const isFirefoxDefaultProfile = sinon.spy(
           () => Promise.resolve(false)
         );

         const promise = firefox.useProfile('profileName', {
           createProfileFinder,
           isFirefoxDefaultProfile,
         });

         await assert.isRejected(promise, UsageError);
         await assert.isRejected(
           promise,
           /The request "profileName" profile name cannot be resolved/
         );
       }
    );

    it('resolves to a FirefoxProfile instance', () => withBaseProfile(
      async (baseProfile) => {
        const configureThisProfile = (profile) => Promise.resolve(profile);
        const createProfileFinder = () => {
          return (profilePath) => Promise.resolve(profilePath);
        };
        const profile = await firefox.useProfile(baseProfile.path(), {
          configureThisProfile,
          createProfileFinder,
        });
        assert.instanceOf(profile, FirefoxProfile);
      }
    ));

    it('looks for profile path if passed a name', () => withBaseProfile(
      async (baseProfile) => {
        const fakeGetProfilePath = sinon.spy(() => baseProfile.path());
        const createProfileFinder = () => {
          return fakeGetProfilePath;
        };
        const isFirefoxDefaultProfile = sinon.spy(
          () => Promise.resolve(false)
        );
        await firefox.useProfile('profileName', {
          createProfileFinder,
          isFirefoxDefaultProfile,
        });
        sinon.assert.calledOnce(fakeGetProfilePath);
        sinon.assert.calledWith(
          fakeGetProfilePath,
          sinon.match('profileName')
        );
      }
    ));

    it('checks if named profile is default', () => withBaseProfile(
      async (baseProfile) => {
        const createProfileFinder = () => {
          return () => Promise.resolve(baseProfile.path());
        };
        const isFirefoxDefaultProfile = sinon.spy(
          () => Promise.resolve(false)
        );
        await firefox.useProfile('profileName', {
          createProfileFinder,
          isFirefoxDefaultProfile,
        });
        sinon.assert.calledOnce(isFirefoxDefaultProfile);
        sinon.assert.calledWith(
          isFirefoxDefaultProfile,
          sinon.match('profileName')
        );
      }
    ));

    it('configures a profile', () => withBaseProfile(
      (baseProfile) => {
        const configureThisProfile =
          sinon.spy((profile) => Promise.resolve(profile));
        const profilePath = baseProfile.path();
        return firefox.useProfile(profilePath, {configureThisProfile})
          .then((profile) => {
            sinon.assert.called(configureThisProfile);
            sinon.assert.calledWith(configureThisProfile, profile);
          });
      }
    ));

  });

  describe('defaultCreateProfileFinder', () => {

    // Define the params type for the prepareProfileFinderTest helper.
    type PrepareProfileFinderTestParams = {|
      readProfiles?: Function,
      getPath?: Function,
      profiles?: Array<{Name: string}>,
    |};

    const defaultFakeProfiles = [{Name: 'someName'}];

    function defaultReadProfilesMock(cb) {
      cb(undefined, defaultFakeProfiles);
    }

    function defaultGetPathMock(name, cb) {
      cb(undefined, '/fake/path');
    }

    function prepareProfileFinderTest({
      readProfiles = defaultReadProfilesMock,
      getPath = defaultGetPathMock,
      profiles = defaultFakeProfiles,
    }: PrepareProfileFinderTestParams = {}) {
      const fakeReadProfiles = sinon.spy(readProfiles);
      const fakeGetPath = sinon.spy(getPath);
      const fakeProfiles = profiles;
      const userDirectoryPath = '/non/existent/path';

      const FxProfile = {};
      FxProfile.Finder = function Finder() {
        return {
          readProfiles: fakeReadProfiles,
          getPath: fakeGetPath,
          profiles: fakeProfiles,
        };
      };

      return {
        fakeReadProfiles,
        fakeGetPath,
        fakeProfiles,
        FxProfile,
        userDirectoryPath,
      };
    }

    it('creates a finder', () => {
      const {FxProfile} = prepareProfileFinderTest();
      FxProfile.Finder = sinon.spy(FxProfile.Finder);
      // $FlowIgnore: allow use of FxProfile as a fake FirefoxProfile class.
      firefox.defaultCreateProfileFinder({FxProfile});
      sinon.assert.calledWith(FxProfile.Finder, sinon.match(undefined));
    });

    it('creates finder based on userDirectoryPath if present', async () => {
      const {FxProfile} = prepareProfileFinderTest();
      FxProfile.Finder = sinon.spy(FxProfile.Finder);

      const userDirectoryPath = '/non/existent/path';
      // $FlowIgnore: allow use of FxProfile as a fake FirefoxProfile class.
      firefox.defaultCreateProfileFinder({userDirectoryPath, FxProfile});

      sinon.assert.called(FxProfile.Finder);
      sinon.assert.calledWith(FxProfile.Finder, sinon.match(userDirectoryPath));
    });

    it('returns a finder that resolves a profile name', async () => {
      const expectedResolvedProfilePath = '/fake/resolved/profile/path';
      const {
        fakeReadProfiles,
        fakeGetPath,
        FxProfile,
        userDirectoryPath,
      } = prepareProfileFinderTest({
        getPath(name, cb) {
          cb(undefined, expectedResolvedProfilePath);
        },
      });

      const profileFinder = firefox.defaultCreateProfileFinder({
        userDirectoryPath,
        // $FlowIgnore: allow use of FxProfile as a fake FirefoxProfile class.
        FxProfile,
      });

      assert.equal(await profileFinder('someName'), expectedResolvedProfilePath,
                   'Got the expected profile path resolved');

      sinon.assert.called(fakeReadProfiles);
      sinon.assert.called(fakeGetPath);
      sinon.assert.calledWith(fakeGetPath, sinon.match('someName'));
    });

    it('returns a finder that resolves undefined for no profiles.ini',
       async () => {
         const {
           fakeReadProfiles,
           fakeGetPath,
           FxProfile,
           userDirectoryPath,
         } = prepareProfileFinderTest({
           readProfiles(cb) {
             cb(new ErrorWithCode('ENOENT', 'fake ENOENT error'));
           },
         });

         const getter = firefox.defaultCreateProfileFinder({
           userDirectoryPath,
           // $FlowIgnore: allow use of FxProfile as a fake FirefoxProfile class.
           FxProfile,
         });

         const res = await getter('someName');

         sinon.assert.called(fakeReadProfiles);
         sinon.assert.notCalled(fakeGetPath);

         assert.equal(
           res,
           undefined,
           'Got an undefined result when the profiles.ini file does not exist');
       });

    it('returns a finder that throws unexpected errors',
       async () => {
         const {
           fakeReadProfiles,
           fakeGetPath,
           FxProfile,
           userDirectoryPath,
         } = prepareProfileFinderTest({
           readProfiles(cb) {
             cb(new Error('unspecified error'));
           },
         });

         const getter = firefox.defaultCreateProfileFinder({
           userDirectoryPath,
           // $FlowIgnore: allow use of FxProfile as a fake FirefoxProfile class.
           FxProfile,
         });

         const promise = getter('someName');

         await assert.isRejected(
           promise,
           'unspecified error',
           'Throws expected error'
         );
         sinon.assert.called(fakeReadProfiles);
         sinon.assert.notCalled(fakeGetPath);
       });

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
            sinon.assert.calledWith(fakePrefGetter, 'firefox');
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
            sinon.assert.calledWith(fakePrefGetter, 'fennec');
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

    it('throws on unexpected errors', () => setUp(
      async (data) => {
        const fakeAsyncFsStat = sinon.spy(async () => {
          throw new Error('Unexpected fs.stat error');
        });
        await assert.isRejected(firefox.installExtension({
          ...data,
          asyncFsStat: fakeAsyncFsStat,
        }), /Unexpected fs.stat error/);

        sinon.assert.calledOnce(fakeAsyncFsStat);
      }
    ));

  });

});

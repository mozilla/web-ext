/* @flow */
import nodeFs from 'fs';
import path from 'path';
import defaultFxRunner from 'fx-runner/lib/run';
import FirefoxProfile, {copyFromUserProfile as defaultUserProfileCopier}
  from 'firefox-profile';
import streamToPromise from 'stream-to-promise';
import fs from 'mz/fs';

import isDirectory from '../util/is-directory';
import {promisify} from '../util/es6-modules';
import {onlyErrorsWithCode, WebExtError} from '../errors';
import {getPrefs as defaultPrefGetter} from './preferences';
import {createLogger} from '../util/logger';

const log = createLogger(__filename);


export const defaultFirefoxEnv = {
  XPCOM_DEBUG_BREAK: 'stack',
  NS_TRACE_MALLOC_DISABLE_STACKS: '1',
};

/*
 * Runs Firefox with the given profile object and resolves a promise on exit.
 */
export function run(
    profile: FirefoxProfile,
    {fxRunner=defaultFxRunner, firefoxBinary, binaryArgs}
    : Object = {}): Promise {

  log.info(`Running Firefox with profile at ${profile.path()}`);
  return fxRunner(
    {
      // if this is falsey, fxRunner tries to find the default one.
      'binary': firefoxBinary,
      'binary-args': binaryArgs,
      'no-remote': false,
      'listen': '6000',
      'foreground': true,
      'profile': profile.path(),
      'env': {
        ...process.env,
        ...defaultFirefoxEnv,
      },
      'verbose': true,
    })
    .then((results) => {
      return new Promise((resolve) => {
        let firefox = results.process;

        log.debug(`Executing Firefox binary: ${results.binary}`);
        log.debug(`Firefox args: ${results.args.join(' ')}`);

        firefox.on('error', (error) => {
          // TODO: show a nice error when it can't find Firefox.
          // if (/No such file/.test(err) || err.code === 'ENOENT') {
          log.error(`Firefox error: ${error}`);
          throw error;
        });

        firefox.stderr.on('data', (data) => {
          log.error(`Firefox stderr: ${data.toString().trim()}`);
        });

        firefox.stdout.on('data', (data) => {
          log.debug(`Firefox stdout: ${data.toString().trim()}`);
        });

        firefox.on('close', () => {
          log.debug('Firefox closed');
        });

        resolve(firefox);
      });
    });
}


/*
 * Configures a profile with common preferences that are required to
 * activate extension development.
 *
 * Returns a promise that resolves with the original profile object.
 */
export function configureProfile(
    profile: FirefoxProfile,
    {app='firefox', getPrefs=defaultPrefGetter}: Object = {}): Promise {
  return new Promise((resolve) => {
    // Set default preferences. Some of these are required for the add-on to
    // operate, such as disabling signatures.
    // TODO: support custom preferences.
    // https://github.com/mozilla/web-ext/issues/88
    let prefs = getPrefs(app);
    Object.keys(prefs).forEach((pref) => {
      profile.setPreference(pref, prefs[pref]);
    });
    profile.updatePreferences();
    return resolve(profile);
  });
}


/*
 * Creates a new temporary profile and resolves with the profile object.
 *
 * The profile will be deleted when the system process exits.
 */
export function createProfile(
    {app, configureThisProfile=configureProfile}: Object = {}): Promise {

  return new Promise(
    (resolve) => {
      // The profile is created in a self-destructing temp dir.
      resolve(new FirefoxProfile());
    })
    .then((profile) => configureThisProfile(profile, {app}));
}


/*
 * Copies an existing Firefox profile and creates a new temporary profile.
 * The new profile will be configured with some preferences required to
 * activate extension development.
 *
 * It resolves with the new profile object.
 *
 * The temporary profile will be deleted when the system process exits.
 *
 * The existing profile can be specified as a directory path or a name of
 * one that exists in the current user's Firefox directory.
 */
export function copyProfile(
    profileDirectory: string,
    {copyFromUserProfile=defaultUserProfileCopier,
     configureThisProfile=configureProfile,
     app}: Object = {}): Promise {

  let copy = promisify(FirefoxProfile.copy);
  let copyByName = promisify(copyFromUserProfile);

  return isDirectory(profileDirectory)
    .then((dirExists) => {
      if (dirExists) {
        log.debug(`Copying profile directory from "${profileDirectory}"`);
        return copy({profileDirectory});
      } else {
        log.debug(`Assuming ${profileDirectory} is a named profile`);
        return copyByName({name: profileDirectory});
      }
    })
    .then((profile) => configureThisProfile(profile, {app}))
    .catch((error) => {
      throw new WebExtError(
        `Could not copy Firefox profile from ${profileDirectory}: ${error}`);
    });
}


class InstallationConfig {
  manifestData: Object;
  profile: FirefoxProfile;
  extensionPath: string;
}

/*
 * Installs an extension into the given Firefox profile object.
 * Resolves when complete.
 *
 * The extension is copied into a special location and you need to turn
 * on some preferences to allow this. See extensions.autoDisableScopes in
 * ./preferences.js.
 */
export function installExtension(
    {manifestData, profile, extensionPath}: InstallationConfig): Promise {

  // This more or less follows
  // https://github.com/saadtazi/firefox-profile-js/blob/master/lib/firefox_profile.js#L531
  // (which is broken for web extensions).
  // TODO: maybe uplift a patch that supports web extensions instead?

  return new Promise(
    (resolve) => {
      if (!profile.extensionsDir) {
        throw new WebExtError('profile.extensionsDir was unexpectedly empty');
      }
      resolve(fs.stat(profile.extensionsDir));
    })
    .catch(onlyErrorsWithCode('ENOENT', () => {
      log.debug(`Creating extensions directory: ${profile.extensionsDir}`);
      return fs.mkdir(profile.extensionsDir);
    }))
    .then(() => {
      let readStream = nodeFs.createReadStream(extensionPath);
      let id = manifestData.applications.gecko.id;

      // TODO: also support copying a directory of code to this
      // destination. That is, to name the directory ${id}.
      // https://github.com/mozilla/web-ext/issues/70
      let destPath = path.join(profile.extensionsDir, `${id}.xpi`);
      let writeStream = nodeFs.createWriteStream(destPath);

      log.debug(`Copying ${extensionPath} to ${destPath}`);
      readStream.pipe(writeStream);

      return Promise.all([
        streamToPromise(readStream),
        streamToPromise(writeStream),
      ]);
    });
}

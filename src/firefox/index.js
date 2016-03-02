/* @flow */
import nodeFs from 'fs';
import path from 'path';
import defaultFxRunner from 'fx-runner/lib/run';
import FirefoxProfile from 'firefox-profile';
import streamToPromise from 'stream-to-promise';

import fs from 'mz/fs';
import {onlyErrorsWithCode, WebExtError} from '../errors';
import {getPrefs as defaultPrefGetter} from './preferences';


export const defaultFirefoxEnv = {
  XPCOM_DEBUG_BREAK: 'stack',
  NS_TRACE_MALLOC_DISABLE_STACKS: '1',
};

export function run(
    profile: FirefoxProfile, {fxRunner=defaultFxRunner}: Object = {}): Promise {

  console.log(`Running Firefox with profile at ${profile.path()}`);
  return fxRunner(
    {
      'binary': null,
      'binary-args': null,
      'no-remote': true,
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

        console.log(`Executing Firefox binary: ${results.binary}`);
        console.log(`Executing Firefox with args: ${results.args.join(' ')}`);

        firefox.on('error', (error) => {
          // TODO: show a nice error when it can't find Firefox.
          // if (/No such file/.test(err) || err.code === 'ENOENT') {
          console.log(`Firefox error: ${error}`);
          throw error;
        });

        firefox.stderr.on('data', (data) => {
          console.error(`stderr: ${data.toString().trim()}`);
        });

        firefox.stdout.on('data', function(data) {
          console.log(`stdout: ${data.toString().trim()}`);
        });

        firefox.on('close', () => {
          console.log('Firefox closed');
          resolve();
        });
      });
    });
}


export function createProfile(
    app: string = 'firefox',
    {getPrefs=defaultPrefGetter}: Object = {}): Promise {

  return new Promise((resolve) => {
    // The profile is created in a self-destructing temp dir.
    // TODO: add option to copy a profile.
    // https://github.com/mozilla/web-ext/issues/69
    let profile = new FirefoxProfile();

    // Set default preferences.
    // TODO: support custom preferences.
    // https://github.com/mozilla/web-ext/issues/88
    let prefs = getPrefs(app);
    Object.keys(prefs).forEach((pref) => {
      profile.setPreference(pref, prefs[pref]);
    });
    profile.updatePreferences();

    resolve(profile);
  });
}


class InstallationConfig {
  manifestData: Object;
  profile: FirefoxProfile;
  extensionPath: string;
}

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
      console.log(`Creating extensions directory: ${profile.extensionsDir}`);
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

      console.log(`Copying ${extensionPath} to ${destPath}`);
      readStream.pipe(writeStream);

      return Promise.all([
        streamToPromise(readStream),
        streamToPromise(writeStream),
      ]);
    });
}

/* @flow */
import * as firefox from '../../src/firefox';
import * as preferences from '../../src/firefox/preferences';


export function run(profile: Object, fxRunner: Function): Promise {
  return firefox.run(profile, {fxRunner});
}

export function runWithFirefox(profile: Object, fxRunner: Function,
                               firefoxBinary: string): Promise {
  return firefox.run(profile, {fxRunner, firefoxBinary});
}


export function createProfile(): Promise {
  return firefox.createProfile();
}

export function createDefaultProfile(fakePrefGetter: Function): Promise {
  return firefox.createProfile(undefined, {getPrefs: fakePrefGetter});
}

export function createFennecProfile(fakePrefGetter: Function): Promise {
  return firefox.createProfile('fennec', {getPrefs: fakePrefGetter});
}


export function getFirefoxPrefs(): Promise {
  return preferences.getPrefs(); // Firefox is the default.
}

export function getFennecPrefs(): Promise {
  return preferences.getPrefs('fennec');
}


export function installExtension(
    manifestData: Object, profile: Object, extensionPath: string): Promise {
  return firefox.installExtension({manifestData, profile, extensionPath});
}

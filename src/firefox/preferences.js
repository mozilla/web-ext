/* @flow */
import {WebExtError, UsageError} from '../errors';
import {createLogger} from '../util/logger';

const log = createLogger(__filename);
export const nonOverridablePreferences = [
  'devtools.debugger.remote-enabled', 'devtools.debugger.prompt-connection',
  'xpinstall.signatures.required',
];

// Flow Types

export type FirefoxPreferences = {
  [key: string]: boolean | string | number,
};

export type PreferencesAppName = 'firefox' | 'fennec';


// Preferences Maps

const prefsCommon: FirefoxPreferences = {
  // Allow debug output via dump to be printed to the system console
  'browser.dom.window.dump.enabled': true,

  // From:
  // https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/internals/preferences.html#data-choices-notification
  // This is the data submission master kill switch. If disabled, no policy is shown or upload takes place, ever.
  'datareporting.policy.dataSubmissionEnabled': false,

  // Allow remote connections to the debugger.
  'devtools.debugger.remote-enabled': true,
  // Disable the prompt for allowing connections.
  'devtools.debugger.prompt-connection': false,
  // Allow extensions to log messages on browser's console.
  'devtools.browserconsole.contentMessages': true,

  // Turn off platform logging because it is a lot of info.
  'extensions.logging.enabled': false,

  // Disable extension updates and notifications.
  'extensions.checkCompatibility.nightly': false,
  'extensions.update.enabled': false,
  'extensions.update.notifyUser': false,

  // From:
  // http://hg.mozilla.org/mozilla-central/file/1dd81c324ac7/build/automation.py.in//l372
  // Only load extensions from the application and user profile.
  // AddonManager.SCOPE_PROFILE + AddonManager.SCOPE_APPLICATION
  'extensions.enabledScopes': 5,
  // Disable metadata caching for installed add-ons by default.
  'extensions.getAddons.cache.enabled': false,
  // Disable intalling any distribution add-ons.
  'extensions.installDistroAddons': false,
  // Allow installing extensions dropped into the profile folder.
  'extensions.autoDisableScopes': 10,

  // Disable app update.
  'app.update.enabled': false,

  // Allow unsigned add-ons.
  'xpinstall.signatures.required': false,

  // browser.link.open_newwindow is changed from 3 to 2 in:
  // https://github.com/saadtazi/firefox-profile-js/blob/cafc793d940a779d280103ae17d02a92de862efc/lib/firefox_profile.js#L32
  // Restore original value to avoid https://github.com/mozilla/web-ext/issues/1592
  'browser.link.open_newwindow': 3,
};

// Prefs specific to Firefox for Android.
const prefsFennec: FirefoxPreferences = {
  'browser.console.showInPanel': true,
  'browser.firstrun.show.uidiscovery': false,
  'devtools.remote.usb.enabled': true,
};

// Prefs specific to Firefox for desktop.
const prefsFirefox: FirefoxPreferences = {
  'browser.startup.homepage': 'about:blank',
  'startup.homepage_welcome_url': 'about:blank',
  'startup.homepage_welcome_url.additional': '',
  'devtools.errorconsole.enabled': true,
  'devtools.chrome.enabled': true,

  // From:
  // http://hg.mozilla.org/mozilla-central/file/1dd81c324ac7/build/automation.py.in//l388
  // Make url-classifier updates so rare that they won't affect tests.
  'urlclassifier.updateinterval': 172800,
  // Point the url-classifier to a nonexistent local URL for fast failures.
  'browser.safebrowsing.provider.0.gethashURL':
    'http://localhost/safebrowsing-dummy/gethash',
  'browser.safebrowsing.provider.0.keyURL':
    'http://localhost/safebrowsing-dummy/newkey',
  'browser.safebrowsing.provider.0.updateURL':
    'http://localhost/safebrowsing-dummy/update',

  // Disable self repair/SHIELD
  'browser.selfsupport.url': 'https://localhost/selfrepair',
  // Disable Reader Mode UI tour
  'browser.reader.detectedFirstArticle': true,

  // Set the policy firstURL to an empty string to prevent
  // the privacy info page to be opened on every "web-ext run".
  // (See #1114 for rationale)
  'datareporting.policy.firstRunURL': '',
};

const prefs = {
  common: prefsCommon,
  fennec: prefsFennec,
  firefox: prefsFirefox,
};


// Module exports

export type PreferencesGetterFn =
  (appName: PreferencesAppName) => FirefoxPreferences;

export function getPrefs(
  app: PreferencesAppName = 'firefox'
): FirefoxPreferences {
  const appPrefs = prefs[app];
  if (!appPrefs) {
    throw new WebExtError(`Unsupported application: ${app}`);
  }
  return {
    ...prefsCommon,
    ...appPrefs,
  };
}

export function coerceCLICustomPreference(
  cliPrefs: Array<string>
): FirefoxPreferences {
  const customPrefs = {};

  for (const pref of cliPrefs) {
    const prefsAry = pref.split('=');

    if (prefsAry.length < 2) {
      throw new UsageError(
        `Incomplete custom preference: "${pref}". ` +
        'Syntax expected: "prefname=prefvalue".'
      );
    }

    const key = prefsAry[0];
    let value = prefsAry.slice(1).join('=');

    if (/[^\w{@}.-]/.test(key)) {
      throw new UsageError(`Invalid custom preference name: ${key}`);
    }

    if (value === `${parseInt(value)}`) {
      value = parseInt(value, 10);
    } else if (value === 'true' || value === 'false') {
      value = (value === 'true');
    }

    if (nonOverridablePreferences.includes(key)) {
      log.warn(`'${key}' preference cannot be customized.`);
      continue;
    }
    customPrefs[`${key}`] = value;
  }

  return customPrefs;
}

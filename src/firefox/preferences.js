/* @flow */
import {WebExtError} from '../errors';


// Flow Types

export type FirefoxPreferences = {
  [key: string]: bool | string | number,
};

export type PreferencesAppName = 'firefox' | 'fennec';


// Preferences Maps

const prefsCommon: FirefoxPreferences = {
  // Allow debug output via dump to be printed to the system console
  'browser.dom.window.dump.enabled': true,
  // Warn about possibly incorrect code.
  'javascript.options.strict': true,
  'javascript.options.showInConsole': true,

  // Allow remote connections to the debugger.
  'devtools.debugger.remote-enabled': true,
  // Disable the prompt for allowing connections.
  'devtools.debugger.prompt-connection': false,

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

  // Point update checks to a nonexistent local URL for fast failures.
  'extensions.update.url': 'http://localhost/extensions-dummy/updateURL',
  'extensions.blocklist.url':
    'http://localhost/extensions-dummy/blocklistURL',

  // Make sure opening about:addons won't hit the network.
  'extensions.webservice.discoverURL':
    'http://localhost/extensions-dummy/discoveryURL',

  // Allow unsigned add-ons.
  'xpinstall.signatures.required': false,
};

// Prefs specific to Firefox for Android.
const prefsFennec: FirefoxPreferences = {
  'browser.console.showInPanel': true,
  'browser.firstrun.show.uidiscovery': false,
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

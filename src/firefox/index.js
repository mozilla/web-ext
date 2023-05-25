import nodeFs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { default as defaultFxRunner } from 'fx-runner';
import FirefoxProfile from 'firefox-profile';
import { fs } from 'mz';
import fromEvent from 'promise-toolbox/fromEvent';

import isDirectory from '../util/is-directory.js';
import { isErrorWithCode, UsageError, WebExtError } from '../errors.js';
import { getPrefs as defaultPrefGetter } from './preferences.js';
import { getManifestId } from '../util/manifest.js';
import { findFreeTcpPort as defaultRemotePortFinder } from './remote.js';
import { createLogger } from '../util/logger.js';
// Import flow types

const log = createLogger(import.meta.url);

const defaultAsyncFsStat = fs.stat.bind(fs);

const defaultUserProfileCopier = FirefoxProfile.copyFromUserProfile;

export const defaultFirefoxEnv = {
  XPCOM_DEBUG_BREAK: 'stack',
  NS_TRACE_MALLOC_DISABLE_STACKS: '1',
};

// defaultRemotePortFinder types and implementation.

// Declare the needed 'fx-runner' module flow types.

// Run command types and implementaion.

/*
 * Runs Firefox with the given profile object and resolves a promise on exit.
 */
export async function run(
  profile,
  {
    fxRunner = defaultFxRunner,
    findRemotePort = defaultRemotePortFinder,
    firefoxBinary,
    binaryArgs,
    extensions,
    devtools,
  } = {}
) {
  log.debug(`Running Firefox with profile at ${profile.path()}`);

  const remotePort = await findRemotePort();

  if (firefoxBinary && firefoxBinary.startsWith('flatpak:')) {
    const flatpakAppId = firefoxBinary.substring(8);
    log.debug(`Configuring Firefox with flatpak: appId=${flatpakAppId}`);

    // This should be resolved by the fx-runner.
    firefoxBinary = 'flatpak';
    binaryArgs = [
      'run',
      `--filesystem=${profile.path()}`,
      ...extensions.map(({ sourceDir }) => `--filesystem=${sourceDir}:ro`),
      // We need to share the network namespace because we want to connect to
      // Firefox with the remote protocol. There is no way to tell flatpak to
      // only expose a port AFAIK.
      '--share=network',
      // Kill the entire sandbox when the launching process dies, which is what
      // we want since exiting web-ext involves `kill` and the process executed
      // here is `flatpak run`.
      '--die-with-parent',
      flatpakAppId,
    ].concat(...(binaryArgs || []));
  }

  const results = await fxRunner({
    // if this is falsey, fxRunner tries to find the default one.
    binary: firefoxBinary,
    'binary-args': binaryArgs,
    // For Flatpak we need to respect the order of the command arguments because
    // we have arguments for Flapack (first) and then Firefox.
    'binary-args-first': firefoxBinary === 'flatpak',
    // This ensures a new instance of Firefox is created. It has nothing
    // to do with the devtools remote debugger.
    'no-remote': true,
    listen: remotePort,
    foreground: true,
    profile: profile.path(),
    env: {
      ...process.env,
      ...defaultFirefoxEnv,
    },
    verbose: true,
  });

  const firefox = results.process;

  log.debug(`Executing Firefox binary: ${results.binary}`);
  log.debug(`Firefox args: ${results.args.join(' ')}`);

  firefox.on('error', (error) => {
    // TODO: show a nice error when it can't find Firefox.
    // if (/No such file/.test(err) || err.code === 'ENOENT') {
    log.error(`Firefox error: ${error}`);
    throw error;
  });

  if (!devtools) {
    log.info('Use --verbose or --devtools to see logging');
  }
  if (devtools) {
    log.info('More info about WebExtensions debugging:');
    log.info('https://extensionworkshop.com/documentation/develop/debugging/');
  }

  firefox.stderr.on('data', (data) => {
    log.debug(`Firefox stderr: ${data.toString().trim()}`);
  });

  firefox.stdout.on('data', (data) => {
    log.debug(`Firefox stdout: ${data.toString().trim()}`);
  });

  firefox.on('close', () => {
    log.debug('Firefox closed');
  });

  return { firefox, debuggerPort: remotePort };
}

// isDefaultProfile types and implementation.

const DEFAULT_PROFILES_NAMES = ['default', 'dev-edition-default'];

/*
 * Tests if a profile is a default Firefox profile (both as a profile name or
 * profile path).
 *
 * Returns a promise that resolves to true if the profile is one of default Firefox profile.
 */
export async function isDefaultProfile(
  profilePathOrName,
  ProfileFinder = FirefoxProfile.Finder,
  fsStat = fs.stat
) {
  if (DEFAULT_PROFILES_NAMES.includes(profilePathOrName)) {
    return true;
  }

  const baseProfileDir = ProfileFinder.locateUserDirectory();
  const profilesIniPath = path.join(baseProfileDir, 'profiles.ini');
  try {
    await fsStat(profilesIniPath);
  } catch (error) {
    if (isErrorWithCode('ENOENT', error)) {
      log.debug(`profiles.ini not found: ${error}`);

      // No profiles exist yet, default to false (the default profile name contains a
      // random generated component).
      return false;
    }

    // Re-throw any unexpected exception.
    throw error;
  }

  // Check for profile dir path.
  const finder = new ProfileFinder(baseProfileDir);
  const readProfiles = promisify((...args) => finder.readProfiles(...args));

  await readProfiles();

  const normalizedProfileDirPath = path.normalize(
    path.join(path.resolve(profilePathOrName), path.sep)
  );

  for (const profile of finder.profiles) {
    // Check if the profile dir path or name is one of the default profiles
    // defined in the profiles.ini file.
    if (
      DEFAULT_PROFILES_NAMES.includes(profile.Name) ||
      profile.Default === '1'
    ) {
      let profileFullPath;

      // Check for profile name.
      if (profile.Name === profilePathOrName) {
        return true;
      }

      // Check for profile path.
      if (profile.IsRelative === '1') {
        profileFullPath = path.join(baseProfileDir, profile.Path, path.sep);
      } else {
        profileFullPath = path.join(profile.Path, path.sep);
      }

      if (path.normalize(profileFullPath) === normalizedProfileDirPath) {
        return true;
      }
    }
  }

  // Profile directory not found.
  return false;
}

// configureProfile types and implementation.

/*
 * Configures a profile with common preferences that are required to
 * activate extension development.
 *
 * Returns a promise that resolves with the original profile object.
 */
export function configureProfile(
  profile,
  { app = 'firefox', getPrefs = defaultPrefGetter, customPrefs = {} } = {}
) {
  // Set default preferences. Some of these are required for the add-on to
  // operate, such as disabling signatures.
  const prefs = getPrefs(app);
  Object.keys(prefs).forEach((pref) => {
    profile.setPreference(pref, prefs[pref]);
  });
  if (Object.keys(customPrefs).length > 0) {
    const customPrefsStr = JSON.stringify(customPrefs, null, 2);
    log.info(`Setting custom Firefox preferences: ${customPrefsStr}`);
    Object.keys(customPrefs).forEach((custom) => {
      profile.setPreference(custom, customPrefs[custom]);
    });
  }
  profile.updatePreferences();
  return Promise.resolve(profile);
}

export function defaultCreateProfileFinder({
  userDirectoryPath,
  FxProfile = FirefoxProfile,
} = {}) {
  const finder = new FxProfile.Finder(userDirectoryPath);
  const readProfiles = promisify((...args) => finder.readProfiles(...args));
  const getPath = promisify((...args) => finder.getPath(...args));
  return async (profileName) => {
    try {
      await readProfiles();
      const hasProfileName =
        finder.profiles.filter((profileDef) => profileDef.Name === profileName)
          .length !== 0;
      if (hasProfileName) {
        return await getPath(profileName);
      }
    } catch (error) {
      if (!isErrorWithCode('ENOENT', error)) {
        throw error;
      }
      log.warn('Unable to find Firefox profiles.ini');
    }
  };
}

// useProfile types and implementation.

// Use the target path as a Firefox profile without cloning it

export async function useProfile(
  profilePath,
  {
    app,
    configureThisProfile = configureProfile,
    isFirefoxDefaultProfile = isDefaultProfile,
    customPrefs = {},
    createProfileFinder = defaultCreateProfileFinder,
  } = {}
) {
  const isForbiddenProfile = await isFirefoxDefaultProfile(profilePath);
  if (isForbiddenProfile) {
    throw new UsageError(
      'Cannot use --keep-profile-changes on a default profile' +
        ` ("${profilePath}")` +
        ' because web-ext will make it insecure and unsuitable for daily use.' +
        '\nSee https://github.com/mozilla/web-ext/issues/1005'
    );
  }

  let destinationDirectory;
  const getProfilePath = createProfileFinder();

  const profileIsDirPath = await isDirectory(profilePath);
  if (profileIsDirPath) {
    log.debug(`Using profile directory "${profilePath}"`);
    destinationDirectory = profilePath;
  } else {
    log.debug(`Assuming ${profilePath} is a named profile`);
    destinationDirectory = await getProfilePath(profilePath);
    if (!destinationDirectory) {
      throw new UsageError(
        `The request "${profilePath}" profile name ` +
          'cannot be resolved to a profile path'
      );
    }
  }

  const profile = new FirefoxProfile({ destinationDirectory });
  return await configureThisProfile(profile, { app, customPrefs });
}

// createProfile types and implementation.

/*
 * Creates a new temporary profile and resolves with the profile object.
 *
 * The profile will be deleted when the system process exits.
 */
export async function createProfile({
  app,
  configureThisProfile = configureProfile,
  customPrefs = {},
} = {}) {
  const profile = new FirefoxProfile();
  return await configureThisProfile(profile, { app, customPrefs });
}

// copyProfile types and implementation.

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
export async function copyProfile(
  profileDirectory,
  {
    app,
    configureThisProfile = configureProfile,
    copyFromUserProfile = defaultUserProfileCopier,
    customPrefs = {},
  } = {}
) {
  const copy = promisify(FirefoxProfile.copy);
  const copyByName = promisify(copyFromUserProfile);

  try {
    const dirExists = await isDirectory(profileDirectory);

    let profile;

    if (dirExists) {
      log.debug(`Copying profile directory from "${profileDirectory}"`);
      profile = await copy({ profileDirectory });
    } else {
      log.debug(`Assuming ${profileDirectory} is a named profile`);
      profile = await copyByName({ name: profileDirectory });
    }

    return configureThisProfile(profile, { app, customPrefs });
  } catch (error) {
    throw new WebExtError(
      `Could not copy Firefox profile from ${profileDirectory}: ${error}`
    );
  }
}

// installExtension types and implementation.

/*
 * Installs an extension into the given Firefox profile object.
 * Resolves when complete.
 *
 * The extension is copied into a special location and you need to turn
 * on some preferences to allow this. See extensions.autoDisableScopes in
 * ./preferences.js.
 *
 * When asProxy is true, a special proxy file will be installed. This is a
 * text file that contains the path to the extension source.
 */
export async function installExtension({
  asProxy = false,
  manifestData,
  profile,
  extensionPath,
  asyncFsStat = defaultAsyncFsStat,
}) {
  // This more or less follows
  // https://github.com/saadtazi/firefox-profile-js/blob/master/lib/firefox_profile.js#L531
  // (which is broken for web extensions).
  // TODO: maybe uplift a patch that supports web extensions instead?

  if (!profile.extensionsDir) {
    throw new WebExtError('profile.extensionsDir was unexpectedly empty');
  }

  try {
    await asyncFsStat(profile.extensionsDir);
  } catch (error) {
    if (isErrorWithCode('ENOENT', error)) {
      log.debug(`Creating extensions directory: ${profile.extensionsDir}`);
      await fs.mkdir(profile.extensionsDir);
    } else {
      throw error;
    }
  }

  const id = getManifestId(manifestData);
  if (!id) {
    throw new UsageError(
      'An explicit extension ID is required when installing to ' +
        'a profile (applications.gecko.id not found in manifest.json)'
    );
  }

  if (asProxy) {
    log.debug(`Installing as an extension proxy; source: ${extensionPath}`);

    const isDir = await isDirectory(extensionPath);
    if (!isDir) {
      throw new WebExtError(
        'proxy install: extensionPath must be the extension source ' +
          `directory; got: ${extensionPath}`
      );
    }

    // Write a special extension proxy file containing the source
    // directory. See:
    // https://developer.mozilla.org/en-US/Add-ons/Setting_up_extension_development_environment#Firefox_extension_proxy_file
    const destPath = path.join(profile.extensionsDir, `${id}`);
    const writeStream = nodeFs.createWriteStream(destPath);
    writeStream.write(extensionPath);
    writeStream.end();
    return await fromEvent(writeStream, 'close');
  } else {
    // Write the XPI file to the profile.
    const readStream = nodeFs.createReadStream(extensionPath);
    const destPath = path.join(profile.extensionsDir, `${id}.xpi`);
    const writeStream = nodeFs.createWriteStream(destPath);

    log.debug(`Installing extension from ${extensionPath} to ${destPath}`);
    readStream.pipe(writeStream);

    return await Promise.all([
      fromEvent(readStream, 'close'),
      fromEvent(writeStream, 'close'),
    ]);
  }
}

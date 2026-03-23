import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

import { normalizeBinary as normalizeMac } from './macos.js';
import { normalizeBinary as normalizeLinux } from './linux.js';
import { normalizeBinary as normalizeWindows } from './win.js';

function normalizeBinary(binaryPath, platform, arch) {
  platform = platform || os.platform();
  arch = arch || os.arch();
  binaryPath = binaryPath || process.env.JPM_FIREFOX_BINARY || 'firefox';

  const archSuffix = /64/.test(arch) ? '(64)' : '';
  const normalizedPlatform = /darwin/i.test(platform)
    ? 'macos'
    : /win/i.test(platform)
      ? `windows${archSuffix}`
      : /linux/i.test(platform)
        ? `linux${archSuffix}`
        : platform;

  if (binaryPath === 'deved') {
    binaryPath = 'firefoxdeveloperedition';
  }

  if (normalizedPlatform === 'macos') {
    return normalizeMac(binaryPath);
  }

  // Return the path if it contains at least two segments
  if (binaryPath.includes(path.sep)) {
    return binaryPath;
  }

  if (normalizedPlatform.startsWith('linux')) {
    return normalizeLinux(binaryPath);
  }

  return normalizeWindows(binaryPath, archSuffix);
}

// Profiles that do not include "/" are treated as profile names
// to be used by the Firefox profile manager.
function isProfileName(profile) {
  if (!profile) {
    return false;
  }
  return !/[\\/]/.test(profile);
}

function buildArgs(options) {
  let args = [];

  const profilePath = options.profile;
  if (profilePath) {
    if (isProfileName(profilePath)) {
      args.unshift('-P', profilePath);
    } else {
      args.unshift('-profile', profilePath);
    }
  }

  if (options.noRemote) {
    args.unshift('-no-remote');
  }

  if (options.foreground) {
    args.unshift('-foreground');
  }

  if (options.listen) {
    args.unshift('-start-debugger-server', options.listen);
  }

  if (options.binaryArgs) {
    if (options.binaryArgsFirst) {
      args = options.binaryArgs.concat(args);
    } else {
      args = args.concat(options.binaryArgs);
    }
  }

  return args;
}

/**
 * Resolves flatpak binary configuration.
 * Parses the `flatpak:<appId>` prefix and constructs the appropriate
 * binary and argument list for running Firefox inside a Flatpak sandbox.
 */
function resolveFlatpak(binary, { binaryArgs = [], profile, extensions = [] }) {
  const flatpakAppId = binary.substring('flatpak:'.length);
  return {
    binary: 'flatpak',
    binaryArgs: [
      'run',
      `--filesystem=${profile}`,
      ...extensions.map(({ sourceDir }) => `--filesystem=${sourceDir}:ro`),
      // Share the network namespace so we can connect to Firefox
      // with the remote protocol.
      '--share=network',
      // Kill the entire sandbox when the launching process dies, which is
      // what we want since exiting web-ext involves `kill` and the process
      // executed here is `flatpak run`.
      '--die-with-parent',
      flatpakAppId,
      ...binaryArgs,
    ],
    binaryArgsFirst: true,
  };
}

/**
 * Launches Firefox with the given options.
 *
 * @param {Object} options
 *   - `binary` path to Firefox binary, `flatpak:<appId>`, or falsey to auto-detect
 *   - `profile` path to Firefox profile directory
 *   - `binaryArgs` additional CLI arguments (array)
 *   - `noRemote` disable remote calls to Firefox
 *   - `foreground` bring Firefox window to foreground
 *   - `listen` port for the remote debugger server
 *   - `extensions` list of extensions with sourceDir (used for flatpak)
 *   - `env` environment variables
 * @return {Promise<{process: ChildProcess, binary: string, args: string[]}>}
 */
export async function runFirefox(options) {
  const { profile } = options;
  const resolved = normalizeBinary(options.binary);

  const { binary, binaryArgs, binaryArgsFirst } = resolved.startsWith(
    'flatpak:',
  )
    ? resolveFlatpak(resolved, {
        binaryArgs: options.binaryArgs,
        profile,
        extensions: options.extensions,
      })
    : {
        binary: resolved,
        binaryArgs: options.binaryArgs,
        binaryArgsFirst: false,
      };

  const args = buildArgs({ ...options, binaryArgs, binaryArgsFirst });
  const env = { ...process.env, ...(options.env || {}) };
  const firefox = spawn(binary, args, { env });

  function killFirefox() {
    firefox.kill();
  }

  firefox.on('close', () => {
    process.removeListener('exit', killFirefox);
  });

  // Kill child process when main process is killed
  process.once('exit', killFirefox);

  return { process: firefox, binary, args };
}

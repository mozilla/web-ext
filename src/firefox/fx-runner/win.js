import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WINDOWS_APP_NAMES = {
  firefox: 'Mozilla Firefox',
  // the default path in the beta installer is the same as the stable one
  beta: 'Mozilla Firefox',
  firefoxdeveloperedition: 'Firefox Developer Edition',
  aurora: 'Aurora',
  nightly: 'Nightly',
};

function getRegistryValue(hive, key, name) {
  const output = execFileSync('reg', ['query', `${hive}${key}`, '/v', name], {
    encoding: 'utf-8',
  });
  // reg query output format: "    name    REG_SZ    value"
  const match = output.match(new RegExp(`${name}\\s+REG_SZ\\s+(.+)`));
  if (match) {
    return match[1].trim();
  }
  throw new Error(`Registry value not found: ${hive}${key}\\${name}`);
}

function getPathToExe(hive, appName) {
  const rootKey = `\\Software\\Mozilla\\${appName}`;
  const version = getRegistryValue(hive, rootKey, 'CurrentVersion');
  return getRegistryValue(hive, `${rootKey}\\${version}\\Main`, 'PathToExe');
}

export function normalizeBinary(binaryPath, archSuffix) {
  // No action needed on windows if it's an executable already
  if (path.extname(binaryPath) === '.exe') {
    return binaryPath;
  }

  const app = binaryPath.toLowerCase();
  const appName = WINDOWS_APP_NAMES[app];
  try {
    return getPathToExe('HKCU', appName);
  } catch {
    try {
      return getPathToExe('HKLM', appName);
    } catch {
      // Neither registry hive has the correct keys
      const programFilesVar =
        archSuffix === '(64)' ? 'ProgramFiles(x86)' : 'ProgramFiles';
      if (archSuffix === '(64)') {
        // eslint-disable-next-line no-console
        console.warn(
          'You are using 32-bit version of Firefox on 64-bit versions of the Windows.\n' +
            'Some features may not work correctly in this version. ' +
            'You should upgrade Firefox to the latest 64-bit version now!',
        );
      }
      const fallbackPath = path.join(
        process.env[programFilesVar],
        appName,
        'firefox.exe',
      );
      if (!fs.existsSync(fallbackPath)) {
        throw new Error(
          `Could not find Firefox at "${fallbackPath}". ` +
            'Use --firefox to specify the path to your Firefox binary.',
        );
      }
      return fallbackPath;
    }
  }
}

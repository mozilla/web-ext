import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAC_PATHS = {
  firefox: '/Applications/Firefox.app/Contents/MacOS/firefox',
  // the name of the beta application bundle is the same as the stable one
  beta: '/Applications/Firefox.app/Contents/MacOS/firefox',
  firefoxdeveloperedition:
    '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
  aurora: '/Applications/FirefoxAurora.app/Contents/MacOS/firefox',
  nightly: '/Applications/Firefox Nightly.app/Contents/MacOS/firefox',
};

const MAC_CHANNEL_NAMES = [
  'firefox',
  'firefoxdeveloperedition',
  'beta',
  'nightly',
  'aurora',
];

function findMacAppByChannel(channel) {
  let results;
  try {
    results = execFileSync('mdfind', [
      `kMDItemCFBundleIdentifier == 'org.mozilla.${channel}'`,
    ]);
  } catch {
    return null;
  }

  const allMatches = results.toString().split('\n').filter(Boolean);
  // Prefer the one installed in the official app location
  const officialApp = allMatches.find((p) => p.startsWith('/Applications/'));
  return officialApp || allMatches[0] || null;
}

export function normalizeBinary(binaryPath) {
  const app = binaryPath.toLowerCase();

  let result = null;
  if (MAC_CHANNEL_NAMES.includes(binaryPath)) {
    result = findMacAppByChannel(binaryPath);
  }
  binaryPath = result || MAC_PATHS[app] || binaryPath;
  if (path.extname(binaryPath) === '.app') {
    binaryPath = path.join(binaryPath, 'Contents/MacOS/firefox');
  }
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `Could not find Firefox at "${binaryPath}". ` +
        'Use --firefox to specify the path to your Firefox binary.',
    );
  }
  return binaryPath;
}

import { execFileSync } from 'node:child_process';

const LINUX_APP_NAMES = {
  firefox: 'firefox',
  beta: 'firefox-beta',
  aurora: 'firefox-aurora',
  firefoxdeveloperedition: 'firefox-developer-edition',
  nightly: 'firefox-nightly',
};

const FLATPAK_APP_IDS = {
  firefox: 'org.mozilla.firefox',
};

export function normalizeBinary(binaryPath) {
  // Handle explicit flatpak: prefix (e.g. --firefox "flatpak:org.mozilla.firefox")
  if (binaryPath.startsWith('flatpak:')) {
    const flatpakAppId = binaryPath.substring('flatpak:'.length);
    try {
      execFileSync('flatpak', ['info', flatpakAppId], { stdio: 'ignore' });
      return binaryPath;
    } catch {
      throw new Error(
        `Flatpak app "${flatpakAppId}" is not installed. ` +
          'Use --firefox to specify the path to your Firefox binary.',
      );
    }
  }

  const app = binaryPath.toLowerCase();
  const linuxName = LINUX_APP_NAMES[app] || binaryPath;
  try {
    return execFileSync('which', [linuxName]).toString().trim();
  } catch {
    // Fallback: check for Flatpak-installed Firefox
    const flatpakAppId = FLATPAK_APP_IDS[app];
    if (flatpakAppId) {
      try {
        execFileSync('flatpak', ['info', flatpakAppId], { stdio: 'ignore' });
        return `flatpak:${flatpakAppId}`;
      } catch {
        // Flatpak app not installed
      }
    }
    throw new Error(
      `Could not find "${linuxName}" on your PATH or as a Flatpak app. ` +
        'Use --firefox to specify the path to your Firefox binary.',
    );
  }
}

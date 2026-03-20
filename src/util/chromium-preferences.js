import { UsageError } from '../errors.js';

export function coerceCLICustomChromiumPreference(cliPrefs) {
  const chromiumPrefs = new Map();

  for (const pref of cliPrefs) {
    const prefsAry = pref.split('=');

    if (prefsAry.length < 2) {
      throw new UsageError(
        `Incomplete custom preference: "${pref}". ` +
          'Syntax expected: "prefname=prefvalue".',
      );
    }

    const key = prefsAry[0];
    let value = prefsAry.slice(1).join('=');


    if (value === `${parseInt(value)}`) {
      value = parseInt(value, 10);
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    }

    chromiumPrefs.set(key, value);
  }

  return chromiumPrefs;
}

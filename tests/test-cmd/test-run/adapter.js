/* @flow */
import FirefoxProfile from 'firefox-profile';

import runCommand from '../../../src/cmd/run';


export function run(sourceDir: string, firefox: FirefoxProfile): Promise {
  return runCommand({sourceDir}, {firefox});
}

export function runWithFirefox(sourceDir: string, firefox: FirefoxProfile,
                               firefoxBinary: string): Promise {
  return runCommand({sourceDir, firefoxBinary}, {firefox});
}

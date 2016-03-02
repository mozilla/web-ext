/* @flow */
import FirefoxProfile from 'firefox-profile';

import runCommand from '../../../src/cmd/run';


export function run(sourceDir: string, firefox: FirefoxProfile): Promise {
  return runCommand(
    {
      sourceDir,
      buildDir: '/dev/null', // this should never be used.
    },
    {firefox});
}

/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import {
  minimalAddonPath, fakeFirefoxPath,
  withTempAddonDir, execWebExt, reportCommandErrors,
} from './common';

const EXPECTED_MESSAGE = 'Fake Firefox binary executed correctly.';

describe('web-ext run', () => {

  it('should accept: --no-reload --source-dir SRCDIR --firefox FXPATH',
     () => withTempAddonDir(
       {addonPath: minimalAddonPath},
       (srcDir) => {
         const argv = [
           'run', '--verbose', '--no-reload',
           '--source-dir', srcDir,
           '--firefox', fakeFirefoxPath,
         ];
         const spawnOptions = {
           env: {
             PATH: process.env.PATH,
             EXPECTED_MESSAGE,
             addonPath: srcDir,
           },
         };

         const cmd = execWebExt(argv, spawnOptions);

         return cmd.waitForExit.then(({exitCode, stdout, stderr}) => {
           if (stdout.indexOf(EXPECTED_MESSAGE) < 0) {
             reportCommandErrors({
               argv,
               exitCode,
               stdout,
               stderr,
             }, 'The fake Firefox binary has not been executed');
           } else if (exitCode !== 0) {
             reportCommandErrors({
               argv,
               exitCode,
               stdout,
               stderr,
             });
           }
         });
       }));

  it('should not accept: --target INVALIDTARGET', async () => {
    const argv = [
      'run',
      '--target', 'firefox-desktop',
      '--target', 'not-supported',
      '--target', 'firefox-android',
    ];

    return execWebExt(argv, {}).waitForExit.then(({exitCode, stderr}) => {
      assert.notEqual(exitCode, 0);
      assert.match(stderr, /Invalid values/);
      assert.match(stderr, /Given: "not-supported"/);
    });
  });
});

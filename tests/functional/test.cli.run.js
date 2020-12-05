/* @flow */
import path from 'path';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import { fs } from 'mz';

import {
  minimalAddonPath, fakeFirefoxPath,
  withTempAddonDir, execWebExt, reportCommandErrors,
} from './common';

const EXPECTED_MESSAGE = 'Fake Firefox binary executed correctly.';

describe('web-ext run', () => {

  it('accepts: --no-reload --watch-file --source-dir SRCDIR ' +
    '--firefox FXPATH --watch-ignored',
     () => withTempAddonDir(
       {addonPath: minimalAddonPath},
       (srcDir) => {
         const watchedFile = path.join(srcDir, 'watchedFile.txt');
         const watchIgnoredArr = ['ignoredFile1.txt', 'ignoredFile2.txt'].map(
           (file) => path.join(srcDir, file)
         );
         const watchIgnoredFile = path.join(srcDir, 'ignoredFile3.txt');

         fs.writeFileSync(watchedFile, '');
         watchIgnoredArr.forEach((file) => fs.writeFileSync(file, ''));
         fs.writeFileSync(watchIgnoredFile, '');

         const argv = [
           'run', '--verbose', '--no-reload',
           '--source-dir', srcDir,
           '--watch-file', watchedFile,
           '--firefox', fakeFirefoxPath,
           '--watch-ignored', ...watchIgnoredArr,
           '--watch-ignored', watchIgnoredFile,
         ];
         const spawnOptions = {
           env: {
             PATH: process.env.PATH,
             EXPECTED_MESSAGE,
             addonPath: srcDir,
             // Add an environment var unrelated to the executed command to
             // ensure we do clear the environment vars from them before
             // yargs is validation the detected cli and env options.
             // (See #793).
             WEB_EXT_API_KEY: 'fake-api-key',
             // Also include an environment var that misses the '_' separator
             // between envPrefix and option name.
             WEB_EXTAPI_SECRET: 'fake-secret',
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

  it('should not accept: --watch-file <directory>', () => withTempAddonDir(
    {addonPath: minimalAddonPath},
    (srcDir) => {
      const argv = [
        'run', '--verbose',
        '--source-dir', srcDir,
        '--watch-file', srcDir,
        '--firefox', fakeFirefoxPath,
      ];

      const spawnOptions = {
        env: {
          PATH: process.env.PATH,
          addonPath: srcDir,
        },
      };

      return execWebExt(argv, spawnOptions).waitForExit.then(({stdout}) => {
        assert.match(
          stdout,
          /Invalid --watch-file value: .+ is not a file./
        );
      });
    }));

  it('should not accept: --target INVALIDTARGET', async () => {
    const argv = [
      'run',
      '--target', 'firefox-desktop',
      '--target', 'firefox-android',
      '--target', 'chromium',
      '--target', 'not-supported',
    ];

    return execWebExt(argv, {}).waitForExit.then(({exitCode, stderr}) => {
      assert.notEqual(exitCode, 0);
      assert.match(stderr, /Invalid values/);
      assert.match(stderr, /Given: "not-supported"/);
    });
  });
});

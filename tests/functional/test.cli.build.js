/* @flow */
import {describe, it} from 'mocha';

import {
  webExt, addonPath,
  withTempAddonDir, runCommand, reportRunCommandError,
} from './common';

describe('web-ext build', () => {
  it('should accept: --source-dir SRCDIR',
     () => withTempAddonDir({addonPath}, (srcDir, tmpDir) => {
       const argv =  ['build', '--source-dir', srcDir, '--verbose'];
       const cmd = runCommand(webExt, argv, {cwd: tmpDir});

       return cmd.waitForExit.then(({exitCode, stdout, stderr}) => {
         if (exitCode !== 0) {
           reportRunCommandError({
             argv,
             exitCode,
             stdout,
             stderr,
           });
         }
       });
     })
    );
});

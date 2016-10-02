/* @flow */
import {describe, it} from 'mocha';

import {
  webExt, addonPath,
  withTempAddonDir, execCommand, reportCommandErrors,
} from './common';

describe('web-ext build', () => {
  it('should accept: --source-dir SRCDIR',
     () => withTempAddonDir({addonPath}, (srcDir, tmpDir) => {
       const argv = ['build', '--source-dir', srcDir, '--verbose'];
       const cmd = execCommand(webExt, argv, {cwd: tmpDir});

       return cmd.waitForExit.then(({exitCode, stdout, stderr}) => {
         if (exitCode !== 0) {
           reportCommandErrors({
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

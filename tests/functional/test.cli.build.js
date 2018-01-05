/* @flow */
import {describe, it} from 'mocha';

import {
  minimalAddonPath, withTempAddonDir, execWebExt, reportCommandErrors,
} from './common';

describe('web-ext build', () => {
  it('should accept: --source-dir SRCDIR',
     () => withTempAddonDir({addonPath: minimalAddonPath}, (srcDir, tmpDir) => {
       const argv = ['build', '--source-dir', srcDir, '--verbose'];
       const cmd = execWebExt(argv, {cwd: tmpDir});

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

import { describe, it } from 'mocha';
import { assert } from 'chai';

import {
  minimalAddonPath,
  withTempAddonDir,
  execWebExt,
  reportCommandErrors,
} from './common.js';

describe('web-ext build', () => {
  it('should accept: --source-dir SRCDIR', () =>
    withTempAddonDir({ addonPath: minimalAddonPath }, (srcDir, tmpDir) => {
      const argv = ['build', '--source-dir', srcDir, '--verbose'];
      const cmd = execWebExt(argv, { cwd: tmpDir });

      return cmd.waitForExit.then(({ exitCode, stdout, stderr }) => {
        if (exitCode !== 0) {
          reportCommandErrors({
            argv,
            exitCode,
            stdout,
            stderr,
          });
        }
      });
    }));

  it('throws an error on multiple -n', () =>
    withTempAddonDir({ addonPath: minimalAddonPath }, (srcDir, tmpDir) => {
      const argv = ['build', '-n', 'foo', '-n', 'bar'];
      const cmd = execWebExt(argv, { cwd: tmpDir });
      return cmd.waitForExit.then(({ exitCode, stderr }) => {
        assert.notEqual(exitCode, 0);
        assert.match(stderr, /Multiple --filename\/-n option are not allowed/);
      });
    }));
});

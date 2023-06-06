import { describe, it } from 'mocha';
import { assert } from 'chai';

import { withTempDir, execWebExt, reportCommandErrors } from './common.js';

describe('web-ext', () => {
  it('should accept: --help', () =>
    withTempDir((tmpDir) => {
      const argv = ['--help'];
      const cmd = execWebExt(argv, { cwd: tmpDir.path() });

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

  it('should hide --input from --help output', () =>
    withTempDir(async (tmpDir) => {
      const cmd = execWebExt(['--help'], { cwd: tmpDir.path() });
      const { stdout } = await cmd.waitForExit;
      assert.equal(
        stdout.includes('--input'),
        false,
        'help does not include --input'
      );
      assert.equal(
        stdout.includes('--no-input'),
        true,
        'help does include --no-input'
      );
    }));
});

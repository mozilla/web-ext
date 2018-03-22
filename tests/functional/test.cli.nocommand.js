/* @flow */
import {describe, it} from 'mocha';

import {
  withTempDir, execWebExt, reportCommandErrors,
} from './common';

describe('web-ext', () => {
  it('should accept: --help', () => withTempDir((tmpDir) => {
    const argv = ['--help'];
    const cmd = execWebExt(argv, {cwd: tmpDir.path()});

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
  }));
});

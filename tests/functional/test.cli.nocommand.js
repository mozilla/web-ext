/* @flow */
import {describe, it} from 'mocha';

import {
  webExt,
  withTempDir, execCommand, reportCommandErrors,
} from './common';

describe('web-ext', () => {
  it('should accept: --help', () => withTempDir((tmpDir) => {
    const argv = ['--help'];
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
  }));
});

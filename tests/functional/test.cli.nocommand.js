/* @flow */
import {describe, it} from 'mocha';

import {
  webExt,
  withTempDir, runCommand, reportProgramErrors,
} from './common';

describe('web-ext', () => {
  it('should accept: --help', () => withTempDir((tmpDir) => {
    const argv = ['--help'];
    const cmd = runCommand(webExt, argv, {cwd: tmpDir});

    return cmd.waitForExit.then(({exitCode, stdout, stderr}) => {
      if (exitCode !== 0) {
        reportProgramErrors({
          argv,
          exitCode,
          stdout,
          stderr,
        });
      }
    });
  }));
});

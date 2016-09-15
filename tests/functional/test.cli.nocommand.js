/* @flow */
import {describe, it} from 'mocha';

import {
  webExt,
  withTempDir, runCommand, reportRunCommandError,
} from './common';

describe('web-ext', () => {
  it('should accept: --help', () => withTempDir((tmpDir) => {
    const argv = ['--help'];
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
  }));
});

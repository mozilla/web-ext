import { describe, it } from 'mocha';
import { assert } from 'chai';
import parseJSON from 'parse-json';

import { withTempDir, execWebExt, reportCommandErrors } from './common.js';

describe('web-ext dump-config', () => {
  it('should emit valid JSON string to stdout', () =>
    withTempDir((tmpDir) => {
      const argv = ['dump-config'];
      const cmd = execWebExt(argv, { cwd: tmpDir.path() });

      return cmd.waitForExit.then(({ exitCode, stdout, stderr }) => {
        if (exitCode !== 0) {
          reportCommandErrors({
            argv,
            exitCode,
            stdout,
            stderr,
          });
          return;
        }
        const parsedConfigData = parseJSON(stdout);
        assert.equal(parsedConfigData.sourceDir, tmpDir.path());
      });
    }));
});

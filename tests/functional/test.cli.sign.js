/* @flow */
import {spawn} from 'child_process';

import {describe, it, beforeEach, afterEach} from 'mocha';

import {
  minimalAddonPath, fakeServerPath,
  withTempAddonDir, execWebExt, reportCommandErrors,
} from './common';

describe('web-ext sign', () => {
  let fakeServerProcess;

  beforeEach(() => {
    return new Promise((resolve, reject) => {
      fakeServerProcess = spawn(process.execPath, [fakeServerPath]);
      fakeServerProcess.stdout.on('data', resolve);
      fakeServerProcess.stderr.on('data', reject);
    });
  });

  afterEach(() => {
    if (fakeServerProcess) {
      fakeServerProcess.kill();
      fakeServerProcess = null;
    }
  });

  it('should accept: --source-dir SRCDIR --api-url-prefix URL',
     () => withTempAddonDir({addonPath: minimalAddonPath}, (srcDir, tmpDir) => {
       const argv = [
         'sign', '--verbose',
         '--api-url-prefix', 'http://localhost:8989/fake/api/v3',
         '--api-key', 'FAKEAPIKEY', '--api-secret', 'FAKEAPISECRET',
         '--source-dir', srcDir,
       ];
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

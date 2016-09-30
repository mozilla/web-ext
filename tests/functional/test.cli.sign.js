/* @flow */
import {spawn} from 'child_process';
import {describe, it, beforeEach, afterEach} from 'mocha';

import {
  webExt, addonPath, fakeServerPath,
  withTempAddonDir, runCommand, reportProgramErrors,
} from './common';

describe('web-ext sign', () => {
  let fakeServerProcess;

  beforeEach(() => {
    fakeServerProcess = spawn(fakeServerPath);
  });

  afterEach(() => {
    if (fakeServerProcess) {
      fakeServerProcess.kill();
      fakeServerProcess = null;
    }
  });

  it('should accept: --source-dir SRCDIR --api-url-prefix URL',
     () => withTempAddonDir({addonPath}, (srcDir, tmpDir) => {
       const argv = [
         'sign', '--verbose',
         '--api-url-prefix', 'http://localhost:8989/fake/api/v3',
         '--api-key', 'FAKEAPIKEY', '--api-secret', 'FAKEAPISECRET',
         '--source-dir', srcDir,
       ];
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
     })
    );
});

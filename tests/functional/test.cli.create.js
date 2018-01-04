/* @flow */
import path from 'path';

import {assert} from 'chai';
import {describe, it} from 'mocha';
import fs from 'mz/fs';

import {
  withTempDir, execWebExt, reportCommandErrors,
} from './common';

function lintProjectPath({projectPath, tmpDir}) {
  const argv = ['lint', '--source-dir', projectPath];
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
}

describe('web-ext create', () => {
  it('should accept: --project-path PROJECTPATH',
     () => withTempDir((tmpDir) => {
       const argv = ['create', '--verbose', '--project-path', 'project1'];
       const cmd = execWebExt(argv, {cwd: tmpDir.path()});

       return cmd.waitForExit.then(async ({exitCode, stdout, stderr}) => {
         if (exitCode !== 0) {
           reportCommandErrors({
             argv,
             exitCode,
             stdout,
             stderr,
           });
         }

         const projectPath = path.join(tmpDir.path(), 'project1');
         let statRes = await fs.stat(projectPath);
         assert.ok(statRes.isDirectory());

         const manifestPath = path.join(projectPath, 'manifest.json');
         statRes = await fs.stat(manifestPath);
         assert.ok(statRes.isFile());

         const manifest = JSON.parse(await fs.readFile(manifestPath));
         assert.equal(manifest.name, 'project1');

         // Check that the generated extension still passes the linting.
         await lintProjectPath({projectPath, tmpDir});
       });
     })
  );
});

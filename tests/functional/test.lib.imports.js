/* @flow */
import {execFileSync} from 'child_process';
import path from 'path';

import {describe, it, before, after} from 'mocha';
import shell from 'shelljs';

import {
  withTempDir, fixturesUseAsLibrary,
} from './common';

const npm = shell.which('npm').toString();
const node = shell.which('node').toString();

describe('web-ext imported as a library', () => {
  before(function() {
    // Only run this test in automation, to avoid running
    // the npm link/npm unlink commands used to prepare
    // the test environment for these tests.
    if (!process.env.CI) {
      this.skip();
    }

    execFileSync(npm, ['link', '.'], {
      cwd: path.resolve(path.join(__dirname, '..', '..')),
    });
  });

  after(() => {
    execFileSync(npm, ['unlink', '.'], {
      cwd: path.resolve(path.join(__dirname, '..', '..')),
    });
  });

  it('can be imported as an ESM module', async () => {
    await withTempDir(async (tmpDir) => {
      execFileSync(npm, ['link', 'web-ext'], {cwd: tmpDir.path()});
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-import.mjs'], {
        cwd: tmpDir.path(),
      });
    });
  });

  it('can be imported as a CommonJS module', async () => {
    await withTempDir(async (tmpDir) => {
      execFileSync(npm, ['link', 'web-ext'], {cwd: tmpDir.path()});
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-require.js'], {
        cwd: tmpDir.path(),
      });
    });
  });
});

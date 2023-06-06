import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, it, before } from 'mocha';
import shell from 'shelljs';

import { withTempDir, fixturesUseAsLibrary } from './common.js';

const npm = shell.which('npm')?.toString();
const node = shell.which('node')?.toString();

const dirname = path.dirname(fileURLToPath(import.meta.url || ''));
const packageDir = path.resolve(path.join(dirname, '..', '..'));

describe('web-ext imported as a library', () => {
  before(function () {
    // Only run this test in automation unless manually activated
    // using the CI environment variable, it is going to re-install
    // all the web-ext production dependencies and so it is time
    // consuming.
    if (!process.env.CI) {
      this.skip();
    }
  });

  it('can be imported as an ESM module', async () => {
    await withTempDir(async (tmpDir) => {
      execFileSync(npm, ['install', packageDir], {
        cwd: tmpDir.path(),
        stdio: 'inherit',
      });
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-import.mjs'], {
        cwd: tmpDir.path(),
      });
    });
  });

  it('can be imported as a CommonJS module', async () => {
    await withTempDir(async (tmpDir) => {
      execFileSync(npm, ['install', packageDir], { cwd: tmpDir.path() });
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-require.js'], {
        cwd: tmpDir.path(),
      });
    });
  });
});

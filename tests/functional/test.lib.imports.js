import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, it, before } from 'mocha';
import shell from 'shelljs';

import { withTempDir, fixturesUseAsLibrary } from './common.js';

let npm = shell.which('npm')?.toString();
if (process.platform === 'win32') {
  npm = `"${npm}"`;
}
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
        // See: https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows
        shell: process.platform === 'win32',
      });
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-import.mjs'], {
        cwd: tmpDir.path(),
      });
    });
  });

  it('can be imported as a CommonJS module', async () => {
    await withTempDir(async (tmpDir) => {
      execFileSync(npm, ['install', packageDir], {
        cwd: tmpDir.path(),
        // See: https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows
        shell: process.platform === 'win32',
      });
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-require.js'], {
        cwd: tmpDir.path(),
      });
    });
  });
});

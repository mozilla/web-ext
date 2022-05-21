/* @flow */
import {execFileSync} from 'child_process';
import path from 'path';

import {describe, it, before, after} from 'mocha';
import shell from 'shelljs';

import {
  withTempDir, fixturesUseAsLibrary,
} from './common';

const npm = shell.which('npm')?.toString();
const node = shell.which('node')?.toString();
const nvm = shell.which('nvm')?.toString();
const isWindows = process.platform === 'win32';

function npmGlobalDir() {
  if (!process.env.HOME) {
    throw new Error('HOME environment variable is undefined');
  }
  const npmDir = path.join(
    process.env.HOME, '.npm-global'
  );
  if (!shell.test('-d', npmDir)) {
    shell.echo(`Creating test npm directory at ${npmDir}`);
    shell.mkdir(npmDir);
  }
  return npmDir;
}

function npmLink() {
  if (nvm || isWindows) {
    execFileSync(npm, ['link', '.'], {
      cwd: path.resolve(path.join(__dirname, '..', '..')),
    });
  } else {
    execFileSync(npm, ['link', '.'], {
      cwd: path.resolve(path.join(__dirname, '..', '..')),
      env: {
        ...process.env,
        NPM_CONFIG_PREFIX: npmGlobalDir(),
      },
    });
  }
}

function npmUnlink() {
  if (nvm || isWindows) {
    execFileSync(npm, ['unlink', '.'], {
      cwd: path.resolve(path.join(__dirname, '..', '..')),
    });
  } else {
    execFileSync(npm, ['unlink', '.'], {
      cwd: path.resolve(path.join(__dirname, '..', '..')),
      env: {
        ...process.env,
        NPM_CONFIG_PREFIX: npmGlobalDir(),
      },
    });
  }
}

describe('web-ext imported as a library', () => {
  before(function() {
    // Only run this test in automation, to avoid running
    // the npm link/npm unlink commands used to prepare
    // the test environment for these tests.
    if (!process.env.CI) {
      this.skip();
    }

    npmLink();
  });

  after(() => {
    npmUnlink();
  });

  it('can be imported as an ESM module', async () => {
    await withTempDir(async (tmpDir) => {
      execFileSync(npm, ['install', 'web-ext'], {cwd: tmpDir.path()});
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-import.mjs'], {
        cwd: tmpDir.path(),
      });
    });
  });

  it('can be imported as a CommonJS module', async () => {
    await withTempDir(async (tmpDir) => {
      execFileSync(npm, ['install', 'web-ext'], {cwd: tmpDir.path()});
      shell.cp('-rf', `${fixturesUseAsLibrary}/*`, tmpDir.path());
      execFileSync(node, ['--experimental-modules', 'test-require.js'], {
        cwd: tmpDir.path(),
      });
    });
  });
});

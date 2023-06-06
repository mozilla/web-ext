import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import copyDir from 'copy-dir';
import prettyjson from 'prettyjson';

import * as tmpDirUtils from '../../src/util/temp-dir.js';

export const withTempDir = tmpDirUtils.withTempDir;

export const functionalTestsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url || ''))
);
export const projectDir = path.join(functionalTestsDir, '..', '..');
export const webExt = process.env.TEST_WEB_EXT_BIN
  ? path.resolve(process.env.TEST_WEB_EXT_BIN)
  : path.join(projectDir, 'bin', 'web-ext');
export const fixturesDir = path.join(functionalTestsDir, '..', 'fixtures');
export const minimalAddonPath = path.join(fixturesDir, 'minimal-web-ext');
export const fixturesUseAsLibrary = path.join(fixturesDir, 'webext-as-library');
export const fakeFirefoxPath = path.join(
  functionalTestsDir,
  process.platform === 'win32'
    ? 'fake-firefox-binary.bat'
    : 'fake-firefox-binary.js'
);
export const fakeServerPath = path.join(
  functionalTestsDir,
  'fake-amo-server.js'
);

// withTempAddonDir helper

const copyDirAsPromised = promisify(copyDir);

export function withTempAddonDir({ addonPath }, makePromise) {
  return withTempDir((tmpDir) => {
    const tempAddonDir = path.join(tmpDir.path(), 'tmp-addon-dir');
    return copyDirAsPromised(addonPath, tempAddonDir).then(() => {
      process.chdir(tmpDir.path());

      return makePromise(tempAddonDir, tmpDir.path())
        .then(() => process.chdir(projectDir))
        .catch((err) => {
          process.chdir(projectDir);
          throw err;
        });
    });
  });
}

// reportCommandErrors helper

export function reportCommandErrors(obj, msg) {
  const errorMessage = msg || 'Unexpected web-ext functional test result';
  const formattedErrorData = prettyjson.render(obj);
  const error = new Error(`${errorMessage}: \n${formattedErrorData}`);
  /* eslint-disable no-console */

  // Make the error diagnostic info easier to read.
  console.error('This test failed. Please check the log below to debug.');
  /* eslint-enable no-console */

  // Make sure the test fails and error diagnostic fully reported in the failure.
  throw error;
}

// execWebExt helper

export function execWebExt(argv, spawnOptions) {
  if (spawnOptions.env) {
    spawnOptions.env = {
      // Propagate the current environment when redefining it from the `spawnOptions`
      // otherwise it may trigger unexpected failures due to missing variables that
      // may be expected (e.g. #2444 was failing only on Windows because
      // @pnpm/npm-conf, a transitive dependencies for update-notifier, was expecting
      // process.env.APPDATA to be defined when running on Windows).
      ...process.env,
      ...spawnOptions.env,
    };
  }
  const spawnedProcess = spawn(
    process.execPath,
    [webExt, ...argv],
    spawnOptions
  );

  const waitForExit = new Promise((resolve) => {
    let errorData = '';
    let outputData = '';

    spawnedProcess.stderr.on('data', (data) => (errorData += data));
    spawnedProcess.stdout.on('data', (data) => (outputData += data));

    spawnedProcess.on('close', (exitCode) => {
      resolve({
        exitCode,
        stderr: errorData,
        stdout: outputData,
      });
    });
  });

  return { argv, waitForExit, spawnedProcess };
}

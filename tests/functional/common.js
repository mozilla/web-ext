/* @flow */
import path from 'path';
import {ChildProcess, spawn} from 'child_process';

import copyDir from 'copy-dir';
import promisify from 'es6-promisify';
import prettyjson from 'prettyjson';

import * as tmpDirUtils from '../../src/util/temp-dir';

export const withTempDir = tmpDirUtils.withTempDir;


export const functionalTestsDir = path.resolve(__dirname);
export const projectDir = path.join(functionalTestsDir, '..', '..');
export const webExt = process.env.TEST_WEB_EXT_BIN ?
  path.resolve(process.env.TEST_WEB_EXT_BIN) :
  path.join(projectDir, 'bin', 'web-ext');
export const fixturesDir = path.join(functionalTestsDir, '..', 'fixtures');
export const minimalAddonPath = path.join(fixturesDir, 'minimal-web-ext');
export const fakeFirefoxPath = path.join(
  functionalTestsDir,
  process.platform === 'win32' ?
    'fake-firefox-binary.bat' : 'fake-firefox-binary.js'
);
export const fakeServerPath = path.join(
  functionalTestsDir, 'fake-amo-server.js'
);


// withTempAddonDir helper

export type TempAddonParams = {|
  addonPath: string,
  runFromCwd?: boolean
|};

export type TempAddonCallback =
  (tmpAddonDir: string, tmpDir: string) => Promise<any>

const copyDirAsPromised = promisify(copyDir);
export function withTempAddonDir(
  {addonPath}: TempAddonParams,
  makePromise: TempAddonCallback,
): Promise<any> {
  return withTempDir((tmpDir) => {
    const tempAddonDir = path.join(tmpDir.path(), 'tmp-addon-dir');
    return copyDirAsPromised(addonPath, tempAddonDir)
      .then(() => {
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

export function reportCommandErrors(obj: Object, msg: ?string) {
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

export type WebExtResult = {|
  exitCode: number,
  stderr: string,
  stdout: string,
|};

export type RunningWebExt = {|
  argv: Array<string>,
  waitForExit: Promise<WebExtResult>,
  spawnedProcess: ChildProcess,
|};

export function execWebExt(
  argv: Array<string>, spawnOptions: child_process$spawnOpts,
): RunningWebExt {

  const spawnedProcess = spawn(
    process.execPath, [webExt, ...argv], spawnOptions
  );

  const waitForExit = new Promise((resolve) => {
    let errorData = '';
    let outputData = '';

    spawnedProcess.stderr.on('data', (data) => errorData += data);
    spawnedProcess.stdout.on('data', (data) => outputData += data);

    spawnedProcess.on('close', (exitCode) => {
      resolve({
        exitCode,
        stderr: errorData,
        stdout: outputData,
      });
    });
  });

  return {argv, waitForExit, spawnedProcess};
}

/* @flow */
import {ChildProcess, spawn} from 'child_process';
import copyDir from 'copy-dir';
import path from 'path';
import promisify from 'es6-promisify';


import * as tmpDirUtils from '../../src/util/temp-dir';
export const withTempDir = tmpDirUtils.withTempDir;


export const functionalTestsDir = path.resolve(__dirname);
export const projectDir = path.join(functionalTestsDir, '..', '..');
export const webExt = path.join(projectDir, 'bin', 'web-ext');
export const fixturesDir = path.join(functionalTestsDir, '..', 'fixtures');
export const addonPath = path.join(fixturesDir, 'minimal-web-ext');
export const fakeFirefoxPath = path.join(
  functionalTestsDir, 'fake-firefox-binary.js'
);
export const fakeServerPath = path.join(
  functionalTestsDir, 'fake-amo-server.js'
);


// withTempAddonDir helper

export type TempAddonParams = {
  addonPath: string,
  runFromCwd?: boolean
};

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

        return makePromise(tempAddonDir, tmpDir)
          .then(() => process.chdir(projectDir))
          .catch((err) => {
            process.chdir(projectDir);
            throw err;
          });
      });
  });
}


// reportProgramErrors helper

export function reportProgramErrors(obj: Object, msg: ?string) {
  const errorMessage = msg || 'Unexpected web-ext functional test result';
  const formattedErrorData = JSON.stringify(obj, null, 2);
  const error = new Error(`${errorMessage}: ${formattedErrorData}`);
  /* eslint-disable no-console */

  // Make the error diagnostic info easier to read.
  console.error(errorMessage);

  if (obj.stdout) {
    console.error('\nCommand stdout: ', obj.stdout);
  }

  if (obj.stderr) {
    console.error('\nCommand stdout: ', obj.stderr);
  }
  /* eslint-enable no-console */

  // Make sure the test fails and error diagnostic fully reported in the failure.
  throw error;
}

// runCommand helper

export type RunCommandResult = {
  exitCode: number,
  stderr: string,
  stdout: string,
};

export type RunningCommand = {
  execPath: string,
  argv: Array<string>,
  waitForExit: Promise<RunCommandResult>,
  spawnedProcess: ChildProcess,
};

export function runCommand(
  execPath: string, argv: Array<string>, spawnOptions: child_process$spawnOpts,
): RunningCommand {
  const spawnedProcess = spawn(execPath, argv, spawnOptions);
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

  return {execPath, argv, waitForExit, spawnedProcess};
}

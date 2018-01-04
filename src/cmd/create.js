/* @flow */
import path from 'path';
import childProcess from 'child_process';

import promisify from 'es6-promisify';
import libnpx from 'libnpx';

import {createLogger} from '../util/logger';

const log = createLogger(__filename);

type CreateParams = {
  projectPath: string,
  useLatest: boolean,
}

const execFile = promisify(childProcess.execFile);

export default async function create(
  params: CreateParams,
): Promise<void> {
  const npm_root = (await execFile('npm', ['root', '-g'])).trim();
  const NPM_PATH = path.join(npm_root, 'npm', 'bin', 'npm-cli.js');

  log.debug(`Using npm-cli from ${NPM_PATH}`);

  await libnpx({
    package: ['create-webextension'],
    // Ignore the local dependency and download the last released version
    // from npm.
    ignoreExisting: params.useLatest,
    command: 'create-webextension',
    cmdOpts: [params.projectPath],
    npm: NPM_PATH,
  });
}

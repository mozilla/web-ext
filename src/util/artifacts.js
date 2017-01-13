/* @flow */
import {fs as defaultFS} from 'mz';
import mkdirp from 'mkdirp';
import promisify from 'es6-promisify';

import {UsageError, isErrorWithCode} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);
const promisifiedMkdirp = promisify(mkdirp);

export async function prepareArtifactsDir(
  artifactsDir: string,
  fs?: typeof defaultFS = defaultFS,
  mkdir?: typeof promisifiedMkdirp = promisifiedMkdirp,
): Promise<string> {
  try {
    const stats = await defaultFS.stat(artifactsDir);
    // Check that path is a directory.
    if (!stats.isDirectory()) {
      throw new UsageError(
        `"${artifactsDir}" exists and it is not a directory.`);
    }
    // Check that we can write in the artifacts dir.
    try {
      await fs.access(artifactsDir, fs.W_OK);
    } catch (accessErr) {
      if (isErrorWithCode('EACCES', accessErr)) {
        throw new UsageError(
          `"${artifactsDir}" exists but the user lacks permissions on it.`);
      }
    }
  } catch (error) {
    // Handle errors when the artifactsDir cannot be accessed.
    if (isErrorWithCode('EACCES', error)) {
      throw new UsageError(
        `Cannot access "${artifactsDir}", user lacks permissions.`);
    // Handle errors when the artifactsDir doesn't exists yet.
    } else if (isErrorWithCode('ENOENT', error)) {
      try {
        log.debug(`Creating artifacts directory: ${artifactsDir}`);
        await mkdir(artifactsDir);
      } catch (mkdirErr) {
        // Handle errors when the artifactsDir cannot be created for lack of permissions.
        if (isErrorWithCode('EACCES', mkdirErr)) {
          throw new UsageError(
            `Cannot create "${artifactsDir}", user lacks permissions.`);
        } else {
          throw mkdirErr;
        }
      }
    } else {
      throw error;
    }
  }

  return artifactsDir;
}

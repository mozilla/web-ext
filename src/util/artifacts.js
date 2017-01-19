/* @flow */
import {fs} from 'mz';
import mkdirp from 'mkdirp';
import promisify from 'es6-promisify';

import {UsageError, isErrorWithCode} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);
const asyncMkdirp = promisify(mkdirp);

export async function prepareArtifactsDir(
  artifactsDir: string,
): Promise<string> {
  try {
    const stats = await fs.stat(artifactsDir);
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
    if (isErrorWithCode('EACCES', error)) {
      // Handle errors when the artifactsDir cannot be accessed.
      throw new UsageError(
        `Cannot access "${artifactsDir}", user lacks permissions.`);
    } else if (isErrorWithCode('ENOENT', error)) {
      // Handle errors when the artifactsDir doesn't exists yet.
      try {
        log.debug(`Creating artifacts directory: ${artifactsDir}`);
        await asyncMkdirp(artifactsDir);
      } catch (mkdirErr) {
        if (isErrorWithCode('EACCES', mkdirErr)) {
          // Handle errors when the artifactsDir cannot be created for lack of permissions.
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

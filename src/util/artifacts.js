/* @flow */
import {fs} from 'mz';
import mkdirp from 'mkdirp';
import promisify from 'es6-promisify';

import {UsageError, isErrorWithCode} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);
const defaultAsyncMkdirp = promisify(mkdirp);

type PrepareArtifactsDirOptions = {
  asyncMkdirp?: typeof defaultAsyncMkdirp,
}

export async function prepareArtifactsDir(
  artifactsDir: string,
  {asyncMkdirp = defaultAsyncMkdirp}: PrepareArtifactsDirOptions = {},
): Promise<string> {
  try {
    const stats = await fs.stat(artifactsDir);
    if (!stats.isDirectory()) {
      throw new UsageError(
        `--artifacts-dir="${artifactsDir}" exists but it is not a directory.`);
    }
    // If the artifactsDir already exists, check that we have the write permissions on it.
    try {
      await fs.access(artifactsDir, fs.W_OK);
    } catch (accessErr) {
      if (isErrorWithCode('EACCES', accessErr)) {
        throw new UsageError(
          `--artifacts-dir="${artifactsDir}" exists but the user lacks ` +
          'permissions on it.');
      } else {
        throw accessErr;
      }
    }
  } catch (error) {
    if (isErrorWithCode('EACCES', error)) {
      // Handle errors when the artifactsDir cannot be accessed.
      throw new UsageError(
        `Cannot access --artifacts-dir="${artifactsDir}" because the user ` +
        `lacks permissions: ${error}`);
    } else if (isErrorWithCode('ENOENT', error)) {
      // Create the artifact dir if it doesn't exist yet.
      try {
        log.debug(`Creating artifacts directory: ${artifactsDir}`);
        await asyncMkdirp(artifactsDir);
      } catch (mkdirErr) {
        if (isErrorWithCode('EACCES', mkdirErr)) {
          // Handle errors when the artifactsDir cannot be created for lack of permissions.
          throw new UsageError(
            `Cannot create --artifacts-dir="${artifactsDir}" because the ` +
            `user lacks permissions: ${mkdirErr}`);
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

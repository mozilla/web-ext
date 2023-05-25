import { fs } from 'mz';
import defaultAsyncMkdirp from 'mkdirp';

import { UsageError, isErrorWithCode } from '../errors.js';
import { createLogger } from './logger.js';

const log = createLogger(import.meta.url);

const defaultAsyncFsAccess = fs.access.bind(fs);

export async function prepareArtifactsDir(
  artifactsDir,
  {
    asyncMkdirp = defaultAsyncMkdirp,
    asyncFsAccess = defaultAsyncFsAccess,
  } = {}
) {
  try {
    const stats = await fs.stat(artifactsDir);
    if (!stats.isDirectory()) {
      throw new UsageError(
        `--artifacts-dir="${artifactsDir}" exists but it is not a directory.`
      );
    }
    // If the artifactsDir already exists, check that we have the write permissions on it.
    try {
      await asyncFsAccess(artifactsDir, fs.W_OK);
    } catch (accessErr) {
      if (isErrorWithCode('EACCES', accessErr)) {
        throw new UsageError(
          `--artifacts-dir="${artifactsDir}" exists but the user lacks ` +
            'permissions on it.'
        );
      } else {
        throw accessErr;
      }
    }
  } catch (error) {
    if (isErrorWithCode('EACCES', error)) {
      // Handle errors when the artifactsDir cannot be accessed.
      throw new UsageError(
        `Cannot access --artifacts-dir="${artifactsDir}" because the user ` +
          `lacks permissions: ${error}`
      );
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
              `user lacks permissions: ${mkdirErr}`
          );
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

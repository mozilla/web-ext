/* @flow */
import {fs} from 'mz';

import {UsageError, isErrorWithCode} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);


export async function prepareArtifactsDir(
  artifactsDir: string
): Promise<string> {
  try {
    const stats = await fs.stat(artifactsDir);
    if (!stats.isDirectory()) {
      throw new UsageError(
        `--artifacts-dir=${artifactsDir} (this value is not a directory)`);
    }
  } catch (error) {
    if (isErrorWithCode('ENOENT', error)) {
      try {
        log.debug(`Creating artifacts directory: ${artifactsDir}`);
        await fs.mkdir(artifactsDir);
      } catch (mkdirErr) {
        if (isErrorWithCode('EACCES', mkdirErr)) {
          throw new UsageError(
            `--artifacts-dir=${artifactsDir} (lack permissions)`);
        } else {
          throw mkdirErr;
        }
      }
    } else if (isErrorWithCode('EACCES', error)) {
      throw new UsageError(
        `--artifacts-dir=${artifactsDir} (lack permissions)`);
    } else {
      throw error;
    }
  }


  return artifactsDir;
}

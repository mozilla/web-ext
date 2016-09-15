/* @flow */
import {fs} from 'mz';
import {WebExtError, isErrorWithCode} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);


export async function prepareArtifactsDir(
  artifactsDir: string
): Promise<string> {
  try {
    const stats = await fs.stat(artifactsDir);
    if (!stats.isDirectory()) {
      throw new WebExtError(`${artifactsDir} is not a directory`);
    }
  } catch (error) {
    if (isErrorWithCode('ENOENT', error)) {
      log.debug(`Creating artifacts directory: ${artifactsDir}`);
      await fs.mkdir(artifactsDir);
    } else {
      throw error;
    }
  }

  return artifactsDir;
}

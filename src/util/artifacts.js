/* @flow */
import fs from 'mz/fs';
import {WebExtError, onlyErrorsWithCode} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);


export function prepareArtifactsDir(artifactsDir: string): Promise {
  return fs.stat(artifactsDir)
    .then((stats) => {
      if (!stats.isDirectory()) {
        throw new WebExtError(`${artifactsDir} is not a directory`);
      }
    })
    .catch(onlyErrorsWithCode('ENOENT', () => {
      log.debug(`Creating artifacts directory: ${artifactsDir}`);
      return fs.mkdir(artifactsDir);
    }))
    .then(() => artifactsDir);
}

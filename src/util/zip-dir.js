/* @flow */
import zipDirModule from 'zip-dir';

import promisify from './promisify';

export const zipDir = promisify(zipDirModule);

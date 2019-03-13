/* @flow */
import {promisify} from 'util';

import zipDirModule from 'zip-dir';

export const zipDir = promisify(zipDirModule);

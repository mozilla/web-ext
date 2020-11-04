/* @flow */
import {promisify} from 'util';

import zipDirModule from 'zip-dir';

type PromisedZipDir =
  (sourceDir: string, { filter(...any): boolean }) => Promise<Buffer>;

export const zipDir: PromisedZipDir = promisify(zipDirModule);

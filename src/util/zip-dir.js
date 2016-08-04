/* @flow */
import zipDirModule from 'zip-dir';
import promisify from 'es6-promisify';

export const zipDir = promisify(zipDirModule);

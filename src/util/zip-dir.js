import promisify from 'es6-promisify';
import zipDirModule from 'zip-dir';

export const zipDir = promisify(zipDirModule);

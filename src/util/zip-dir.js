/* @flow */
import zipDirModule from 'zip-dir';
import {promisify} from './es6-modules';

export const zipDir = promisify(zipDirModule);

/* @flow */
import fs from 'fs';
import {promisify} from './es6-modules';

export const stat = promisify(fs.stat);
export const mkdir = promisify(fs.mkdir);
export const readdir = promisify(fs.readdir);
export const readFile = promisify(fs.readFile);
export const writeFile = promisify(fs.writeFile);

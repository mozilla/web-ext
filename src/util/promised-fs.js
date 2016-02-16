import fs from 'fs';
import promisify from 'es6-promisify';

export const stat = promisify(fs.stat);
export const mkdir = promisify(fs.mkdir);

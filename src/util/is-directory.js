<<<<<<< HEAD
/* @flow */
import {fs} from 'mz';

import {onlyErrorsWithCode} from '../errors';

/*
 * Resolves true if the path is a readable directory.
=======
/* @flow */
import {fs} from 'mz';

import {onlyErrorsWithCode} from '../errors';

/*
 * Resolves true if the path is a readable directory.
>>>>>>> refs/remotes/origin/master
 *
 * Usage:
 *
 * isDirectory('/some/path')
 *  .then((dirExists) => {
 *    // dirExists will be true or false.
 *  });
 *
 * */
export default function isDirectory(path: string): Promise<boolean> {
  return fs.stat(path)
    .then((stats) => stats.isDirectory())
    .catch(onlyErrorsWithCode(['ENOENT', 'ENOTDIR'], () => {
      return false;
    }));
}

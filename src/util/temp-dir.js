/* @flow */
import tmp from 'tmp';
import promisify from 'es6-promisify';

import {createLogger} from './logger';

const log = createLogger(__filename);

export type MakePromiseCallback = (tmpDir: TempDir) => any;


/*
 * Work with a self-destructing temporary directory in a promise chain.
 *
 * The directory will be destroyed when the promise chain is finished
 * (whether there was an error or not).
 *
 * Usage:
 *
 * withTempDir(
 *   (tmpDir) =>
 *     doSomething(tmpDir.path())
 *     .then(...)
 * );
 *
 */
export function withTempDir(makePromise: MakePromiseCallback): Promise<any> {
  const tmpDir = new TempDir();
  return tmpDir.create()
    .then(() => {
      return makePromise(tmpDir);
    })
    .catch(tmpDir.errorHandler())
    .then(tmpDir.successHandler());
}

/*
 * Work with a self-destructing temporary directory object.
 *
 * It is safer to use withTempDir() instead but if you know
 * what you're doing you can use it directly like:
 *
 * let tmpDir = new TempDir();
 * tmpDir.create()
 *   .then(() => {
 *     // work with tmpDir.path()
 *   })
 *   .catch(tmpDir.errorHandler())
 *   .then(tmpDir.successHandler());
 *
 */
export class TempDir {
  _path: string | void;
  _removeTempDir: Function | void;

  constructor() {
    this._path = undefined;
    this._removeTempDir = undefined;
  }

  /*
   * Returns a promise that is fulfilled when the temp directory has
   * been created.
   */
  create(): Promise<TempDir> {
    const createTempDir = promisify(tmp.dir, {multiArgs: true});
    return createTempDir(
      {
        prefix: 'tmp-web-ext-',
        // This allows us to remove a non-empty tmp dir.
        unsafeCleanup: true,
      })
      .then((args) => {
        const [tmpPath, removeTempDir] = args;
        this._path = tmpPath;
        this._removeTempDir = removeTempDir;
        log.debug(`Created temporary directory: ${this.path()}`);
        return this;
      });
  }

  /*
   * Get the absolute path of the temp directory.
   */
  path(): string {
    if (!this._path) {
      throw new Error('You cannot access path() before calling create()');
    }
    return this._path;
  }

  /*
   * Returns a callback that will catch an error, remove
   * the temporary directory, and throw the error.
   *
   * This is intended for use in a promise like
   * Promise().catch(tmp.errorHandler())
   */
  errorHandler(): Function {
    return (error) => {
      this.remove();
      throw error;
    };
  }

  /*
   * Returns a callback that will remove the temporary direcotry.
   *
   * This is intended for use in a promise like
   * Promise().then(tmp.successHandler())
   */
  successHandler(): Function {
    return (promiseResult) => {
      this.remove();
      return promiseResult;
    };
  }

  /*
   * Remove the temp directory.
   */
  remove() {
    if (!this._removeTempDir) {
      return;
    }
    log.debug(`Removing temporary directory: ${this.path()}`);
    this._removeTempDir && this._removeTempDir();
  }

}

import path from 'path';
import tmp from 'tmp';
import promisify from 'es6-promisify';
import yauzl from 'yauzl';


/*
 * A way to read zip files using promises for all the things.
 */
export class ZipFile {

  constructor() {
    this._zip = null;
  }

  /*
   * Open a zip file and return a promise that resolves to a yauzl
   * zipfile object.
   */
  open(...args) {
    return promisify(yauzl.open)(...args)
      .then((zip) => {
        this._zip = zip;
      });
  }

  /*
   * After open(), readEach(onRead) will return a promise that resolves
   * when all entries have been read.
   *
   * The onRead callback receives a single argument, a yauzl Entry object.
   */
  readEach(onRead) {
    return new Promise((resolve, reject) => {

      this._zip.on('entry', (entry) => {
        onRead(entry);
      });

      this._zip.once('error', (error) => {
        reject(error);
      });

      this._zip.once('end', () => {
        resolve();
      });
    });
  }
}


/*
 * Returns a path to a test fixture file. Invoke it the same as path.join().
 */
export function fixturePath(...pathParts) {
  return path.join(__dirname, 'fixtures', ...pathParts);
}


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
export function withTempDir(makePromise) {
  let tmpDir = new TempDir();
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

  constructor() {
    this._path = null;
    this._removeTempDir = null;
  }

  /*
   * Returns a promise that is fulfilled when the temp directory has
   * been created.
   */
  create() {
    let createTempDir = promisify(tmp.dir);
    return createTempDir({
        prefix: 'tmp-web-ext-test-',
        // This allows us to remove a non-empty tmp dir.
        unsafeCleanup: true,
      })
      .then((args) => {
        let [tmpPath, removeTempDir] = args;
        this._path = tmpPath;
        this._removeTempDir = removeTempDir;
        return this;
      });
  }

  /*
   * Get the absolute path of the temp directory.
   */
  path() {
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
  errorHandler() {
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
  successHandler() {
    return () => this.remove();
  }

  /*
   * Remove the temp directory.
   */
  remove() {
    if (!this._removeTempDir) {
      // Nothing was created so there's nothing to remove.
      return;
    }
    this._removeTempDir();
  }

}


/*
 * Test helper to make sure a promise chain really fails.
 *
 * Usage:
 *
 *  Promise.resolve()
 *    .then(makeSureItFails())
 *    .catch((error) => {
 *      // Safely make assertions about the error...
 *    });
 */
export function makeSureItFails() {
  return () => {
    throw new Error('This test unexpectedly succeeded without an error');
  };
}

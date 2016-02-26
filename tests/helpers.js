import path from 'path';
import {promisify} from '../src/util/es6-modules';
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

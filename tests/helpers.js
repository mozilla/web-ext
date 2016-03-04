/* @flow */
import path from 'path';
import sinon from 'sinon';
import {promisify} from '../src/util/es6-modules';
import yauzl from 'yauzl';


/*
 * A way to read zip files using promises for all the things.
 */
export class ZipFile {
  _zip: any;

  constructor() {
    this._zip = null;
  }

  /*
   * Open a zip file and return a promise that resolves to a yauzl
   * zipfile object.
   */
  open(...args: Array<any>): Promise {
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
  readEach(onRead: Function): Promise {
    return new Promise((resolve, reject) => {

      if (!this._zip) {
        throw new Error(
          'Cannot operate on a falsey zip file. Call open() first.');
      }

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
export function fixturePath(...pathParts: Array<string>): string {
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
export function makeSureItFails(): Function {
  return () => {
    throw new Error('This test unexpectedly succeeded without an error');
  };
}


/*
 * Return a fake version of an object for testing.
 *
 * The fake object will contain stub implementations of
 * all original methods. Each method will be wrapped in
 * a sinon.spy() for inspection.
 *
 * You can optionally provide implementations for one or
 * more methods.
 *
 * Unlike similar sinon helpers, this *does not* touch the
 * original object so there is no need to tear down any
 * patches afterwards.
 *
 * Usage:
 *
 * let fakeProcess = fake(process, {
 *   cwd: () => '/some/directory',
 * });
 *
 * // Use the object in real code:
 * fakeProcess.cwd();
 *
 * // Make assertions about methods that
 * // were on the original object:
 * assert.equal(fakeProcess.exit.called, true);
 *
 */
export function fake(original: Object, methods: Object = {}): Object {
  var stub = {};

  // Provide stubs for all original members:
  Object.keys(original).forEach((key) => {
    if (typeof original[key] === 'function') {
      stub[key] = () => {
        console.warn(
          `Running stubbed function ${key} (default implementation)`);
      };
    }
  });

  // Provide custom implementations, if necessary.
  Object.keys(methods).forEach((key) => {
    if (!original[key]) {
      throw new Error(
        `Cannot define method "${key}"; it does not exist on the original`);
    }
    stub[key] = methods[key];
  });

  // Wrap all implementations in spies.
  Object.keys(stub).forEach((key) => {
    stub[key] = sinon.spy(stub[key]);
  });

  return stub;
}

/* @flow */
import path from 'path';

import sinon from 'sinon';
import yauzl from 'yauzl';
import ExtendableError from 'es6-error';
import promisify from 'es6-promisify';

import {createLogger} from '../../src/util/logger';

const log = createLogger(__filename);


/*
 * A way to read zip files using promises for all the things.
 */
export class ZipFile {
  _zip: any;
  _close: Promise<void> | null;

  constructor() {
    this._zip = null;
    this._close = null;
  }

  /*
   * Open a zip file and return a promise that resolves to a yauzl
   * zipfile object.
   */
  open(...args: Array<any>): Promise<void> {
    return promisify(yauzl.open)(...args)
      .then((zip) => {
        this._zip = zip;
        this._close = new Promise((resolve) => {
          zip.once('close', resolve);
        });
      });
  }

  /**
   * Close the zip file and wait fd to release.
   */
  close() {
    this._zip.close();
    return this._close;
  }

  /*
   * After open(), readEach(onRead) will return a promise that resolves
   * when all entries have been read.
   *
   * The onRead callback receives a single argument, a yauzl Entry object.
   */
  readEach(onRead: Function): Promise<void> {
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

  /*
   * Resolve a promise with an array of all file names in the zip archive.
   */
  extractFilenames(): Promise<Array<String>> {
    return new Promise((resolve, reject) => {
      var fileNames = [];
      this.readEach(
        (entry) => {
          fileNames.push(entry.fileName);
        })
        .then(() => {
          resolve(fileNames);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
}


/*
 * Returns a path to a test fixture file. Invoke it the same as path.join().
 */
export function fixturePath(...pathParts: Array<string>): string {
  return path.join(__dirname, '..', 'fixtures', ...pathParts);
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
 // $FLOW_IGNORE: fake can return any kind of object and fake a defined set of methods for testing.
export function fake<T>(original: Object, methods: Object = {}): T {
  var stub = {};

  // Provide stubs for all original members:
  var props = [];
  var obj = original;
  while (obj) {
    props = props.concat(Object.getOwnPropertyNames(obj));
    obj = Object.getPrototypeOf(obj);
  }

  var proto = Object.getPrototypeOf(original);
  for (const key of props) {
    if (!original.hasOwnProperty(key) && !proto.hasOwnProperty(key)) {
      continue;
    }
    const definition = original[key] || proto[key];
    if (typeof definition === 'function') {
      stub[key] = () => {
        log.warn(`Running stubbed function ${key} (default implementation)`);
      };
    }
  }

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


/*
 * Returns a fake Firefox client as would be returned by
 * connect() of 'node-firefox-connect'
 */

type FakeFirefoxClientParams = {|
  requestResult?: Object,
  requestError?: Object,
  makeRequestResult?: Object,
  makeRequestError?: Object,
|}
export function fakeFirefoxClient({
  requestResult = {}, requestError,
  makeRequestResult = {}, makeRequestError,
}: FakeFirefoxClientParams= {}) {
  return {
    disconnect: sinon.spy(() => {}),
    request: sinon.spy(
      (request, callback) => callback(requestError, requestResult)),
    // This is client.client, the actual underlying connection.
    client: {
      on: () => {},
      makeRequest: sinon.spy((request, callback) => {
        //
        // The real function returns a response object that you
        // use like this:
        // if (response.error) {
        //   ...
        // } else {
        //   response.something; // ...
        // }
        //
        if (makeRequestError) {
          let error;
          if (typeof makeRequestError === 'object') {
            error = makeRequestError;
          } else {
            error = {error: makeRequestError};
          }
          callback(error);
        } else {
          callback(makeRequestResult);
        }
      }),
    },
  };
}


/*
 * A simulated TCP connection error.
 *
 * By default, the error code will be ECONNREFUSED.
 */
export class TCPConnectError extends ExtendableError {
  code: string;
  constructor(msg: string = 'simulated connection error') {
    super(msg);
    this.code = 'ECONNREFUSED';
  }
}

export class ErrorWithCode extends Error {
  code: string;
  constructor(code: ?string, message: ?string) {
    super(message || 'pretend this is a system error');
    this.code = code || 'SOME_CODE';
  }
}

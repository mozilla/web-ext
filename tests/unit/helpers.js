/* @flow */
import path from 'path';
import EventEmitter from 'events';
import tty from 'tty';
import stream from 'stream';
import {promisify} from 'util';

import deepcopy from 'deepcopy';
import sinon from 'sinon';
import yauzl from 'yauzl';
import ExtendableError from 'es6-error';

import {createLogger} from '../../src/util/logger';
import * as defaultFirefoxApp from '../../src/firefox';
import {RemoteFirefox} from '../../src/firefox/remote';

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
  close(): Promise<void> | null {
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
 *  Promise.reject(new Error('some error'))
 *    .then(makeSureItFails(), (error) => {
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

// $FlowIgnore: fake can return any kind of object and fake a defined set of methods for testing.
export function fake<T>(
  original: Object, methods: Object = {}, skipProperties: Array<string> = []
): T {
  const stub = {};

  // Provide stubs for all original members:
  const proto = Object.getPrototypeOf(original);
  const props = Object.getOwnPropertyNames(original)
    .concat(Object.getOwnPropertyNames(proto))
    .filter((key) => !skipProperties.includes(key));

  for (const key of props) {
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

  // $FlowIgnore: fake can return any kind of object for testing.
  return stub;
}

export class StubChildProcess extends EventEmitter {
  stderr: EventEmitter = new EventEmitter();
  stdout: EventEmitter = new EventEmitter();
  kill: any = sinon.spy(() => {});
}

export function createFakeProcess(): any {
  return fake(process, {}, ['EventEmitter', 'stdin']);
}

/*
 * Returns a fake FirefoxRDPClient as would be returned by
 * rdp-module connectToFirefox().
 */
export function fakeFirefoxClient(): any {
  return {
    disconnect: sinon.spy(() => {}),
    on: () => {},
    request: sinon.stub().resolves({}),
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
    super(`${code || ''}: ${message || 'pretend this is a system error'}`);
    this.code = code || 'SOME_CODE';
  }
}

/*
 * A basic manifest fixture used in unit tests.
 */
export const basicManifest = {
  name: 'the extension',
  version: '0.0.1',
  applications: {
    gecko: {
      id: 'basic-manifest@web-ext-test-suite',
    },
  },
};

/*
 * A basic manifest fixture without an applications property.
 */
export const manifestWithoutApps: any = deepcopy(basicManifest);
delete manifestWithoutApps.applications;

/*
 * A class that implements an empty IExtensionRunner interface.
 */
export class FakeExtensionRunner {
  params: any;

  constructor(params: any) {
    this.params = params;
  }

  getName(): string {
    return 'Fake Extension Runner';
  }

  async run() {}
  async exit() {}
  async reloadAllExtensions(): Promise<any> {
    return [];
  }
  async reloadExtensionBySourceDir(sourceDir: string): Promise<any> {
    const runnerName = this.getName();
    return [{runnerName, sourceDir}];
  }
  registerCleanup(fn: Function) {} // eslint-disable-line no-unused-vars
}

export function getFakeFirefox(
  implementations: Object = {}, port: number = 6005
): any {
  const profile = {}; // empty object just to avoid errors.
  const firefox = () => Promise.resolve();
  const allImplementations = {
    createProfile: () => Promise.resolve(profile),
    copyProfile: () => Promise.resolve(profile),
    useProfile: () => Promise.resolve(profile),
    installExtension: () => Promise.resolve(),
    run: () => Promise.resolve({firefox, debuggerPort: port}),
    ...implementations,
  };
  return fake(defaultFirefoxApp, allImplementations);
}

export function getFakeRemoteFirefox(implementations: Object = {}): any {
  return fake(RemoteFirefox.prototype, implementations);
}

class FakeStdin extends stream.Readable {
  get isTTY() {
    return true;
  }

  // Fake tty.ReadStream methods.
  setRawMode() {}
  _read() {}
}

export function createFakeStdin(): tty.ReadStream {
  // $FlowIgnore: flow complains that the return value is incompatible with tty.ReadStream
  return new FakeStdin();
}

/* @flow */
import {ExtendableError} from './util/es6-modules';


/*
 * Base error for all custom web-ext errors.
 */
export class WebExtError extends ExtendableError {
  constructor(message: string) {
    super(message);
  }
}


/*
 * The manifest for the extension is invalid (or missing).
 */
export class InvalidManifest extends WebExtError {
  constructor(message: string) {
    super(message);
  }
}


/*
 * The remote Firefox does not support temporary add-on installation.
 */
export class RemoteTempInstallNotSupported extends WebExtError {
  constructor(message: string) {
    super(message);
  }
}


/*
 * Sugar-y way to catch only instances of a certain error.
 *
 * Usage:
 *
 *  Promise.reject(SyntaxError)
 *    .catch(onlyInstancesOf(SyntaxError, (error) => {
 *      // error is guaranteed to be an instance of SyntaxError
 *    }))
 *
 * All other errors will be re-thrown.
 *
 */
export function onlyInstancesOf(
    predicate: Function, errorHandler: Function): Function {
  return (error) => {
    if (error instanceof predicate) {
      return errorHandler(error);
    } else {
      throw error;
    }
  };
}


/*
 * Sugar-y way to catch only errors having certain code(s).
 *
 * Usage:
 *
 *  Promise.resolve()
 *    .catch(onlyErrorsWithCode('ENOENT', (error) => {
 *      // error.code is guaranteed to be ENOENT
 *    }))
 *
 *  or:
 *
 *  Promise.resolve()
 *    .catch(onlyErrorsWithCode(['ENOENT', 'ENOTDIR'], (error) => {
 *      // ...
 *    }))
 *
 * All other errors will be re-thrown.
 *
 */
export function onlyErrorsWithCode(
    codeWanted: string | Array<string>, errorHandler: Function): Function {
  return (error) => {
    let throwError = true;

    if (Array.isArray(codeWanted) && codeWanted.indexOf(error.code) !== -1) {
      throwError = false;
    } else if (error.code === codeWanted) {
      throwError = false;
    }

    if (throwError) {
      throw error;
    }

    return errorHandler(error);
  };
}

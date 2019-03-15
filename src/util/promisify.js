/* @flow */

/*
 * A small promisify helper to make it easier to customize a
 * function promisified (using the 'util' module available in
 * nodejs >= 8) to resolve to an array of results:
 *
 *    import {promisify} from 'util';
 *    import {multiArgsPromisedFn} from '../util/promisify';
 *
 *    aCallbackBasedFn[promisify.custom] = multiArgsPromisedFn(tmp.dir);
 *    ...
 */
export function multiArgsPromisedFn(fn: Function): Function {
  return (...callerArgs: Array<any>): Promise<any> => {
    return new Promise((resolve, reject) => {
      fn(...callerArgs, (err, ...rest) => {
        if (err) {
          reject(err);
        } else {
          resolve(rest);
        }
      });
    });
  };
}

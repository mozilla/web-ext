/* @flow */

import {promisify} from 'util';

// promisify.custom is missing from the node types know to flow,
// and it triggers flow-check errors if used directly.
// By using the value exported here, flow-check passes successfully
// using a single FLOW_IGNORE suppress comment.

// $FlowIgnore: promisify.custom is missing in flow type signatures.
export const promisifyCustom = promisify.custom;

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

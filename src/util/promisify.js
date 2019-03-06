/* @flow */

// promisify helper types and implementation

type PromisifyOptions = {|
  multiArgs: boolean,
|};

export default function(
  fn: Function,
  bindObject: ?Object = null,
  options: PromisifyOptions = {multiArgs: false}
) {
  let fnWithCb = fn;
  if (bindObject != null) {
    fnWithCb = fn.bind(bindObject);
  }

  return function(...callerArgs: Array<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      function cb(err, ...rest) {
        if (err) {
          reject(err);
          return;
        }

        if (options && options.multiArgs) {
          resolve(rest);
        } else {
          resolve(rest[0]);
        }
      }

      fnWithCb(...(callerArgs.concat(cb)));
    });
  };
}

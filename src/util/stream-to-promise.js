/* @flow */

export async function streamToPromise(
  stream: stream$Readable | stream$Writable
) {
  return new Promise((resolve) => {
    stream.on('close', resolve);
  });
}

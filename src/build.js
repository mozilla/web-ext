/* @flow */
import path from 'path';
import {createWriteStream} from 'fs';
import streamToPromise from 'stream-to-promise';

import * as fs from './util/promised-fs';
import {zipDir} from './util/zip-dir';


export default function build({sourceDir, buildDir}: Object) {
  console.log(`Building web extension from ${sourceDir}`);
  return prepareBuildDir(buildDir)
    .then(() => zipDir(sourceDir))
    .then((buffer) => {
      // TODO: actually name the XPI properly.
      // See https://github.com/mozilla/web-ext/issues/37
      let xpiPath = path.join(buildDir, 'some.xpi');
      let stream = createWriteStream(xpiPath);
      let promisedStream = streamToPromise(stream);

      stream.write(buffer, () => stream.end());

      return promisedStream
        .then(() => {
          console.log(`Your web extension is ready: ${xpiPath}`);
          return {
            xpiPath: xpiPath,
          };
        });
    });
}


export function prepareBuildDir(buildDir: string) {
  return fs.stat(buildDir)
    .catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      console.log(`Creating build directory: ${buildDir}`);
      return fs.mkdir(buildDir);
    });
}

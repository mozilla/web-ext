/* @flow */
import path from 'path';
import {createWriteStream} from 'fs';
import streamToPromise from 'stream-to-promise';

import * as fs from '../util/promised-fs';
import {zipDir} from '../util/zip-dir';
import {ProgramOptions} from '../program';
import getValidatedManifest from '../util/manifest';


export default function build(
    {sourceDir, buildDir}: ProgramOptions): Promise {

  console.log(`Building web extension from ${sourceDir}`);

  let initializations = [
    prepareBuildDir(buildDir),
    zipDir(sourceDir),
    getPackageBasename(sourceDir),
  ];

  return Promise.all(initializations)
    .then((results) => {
      let [buildDir, buffer, packageName] = results;
      let extensionPath = path.join(buildDir, packageName);
      let stream = createWriteStream(extensionPath);
      let promisedStream = streamToPromise(stream);

      stream.write(buffer, () => stream.end());

      return promisedStream
        .then(() => {
          console.log(`Your web extension is ready: ${extensionPath}`);
          return {extensionPath};
        });
    });
}


export function getPackageBasename(sourceDir: string): Promise {
  let manifestFile = path.join(sourceDir, 'manifest.json');
  return getValidatedManifest(manifestFile)
    .then((manifestData) => safeFileName(
      `${manifestData.name}-${manifestData.version}.xpi`));
}


export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\.-]+/g, '_');
}


export function prepareBuildDir(buildDir: string) {
  return fs.stat(buildDir)
    .catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      console.log(`Creating build directory: ${buildDir}`);
      return fs.mkdir(buildDir);
    })
    .then(() => buildDir);
}

/* @flow */
import path from 'path';
import {createWriteStream} from 'fs';
import streamToPromise from 'stream-to-promise';

import {onlyErrorsWithCode} from '../errors';
import fs from 'mz/fs';
import {zipDir} from '../util/zip-dir';
import {ProgramOptions} from '../program';
import getValidatedManifest from '../util/manifest';


export default function build(
    {sourceDir, buildDir}: ProgramOptions,
    {manifestData}: Object = {}): Promise {

  console.log(`Building web extension from ${sourceDir}`);

  let resolveManifest;
  if (manifestData) {
    console.log(`Using manifest id=${manifestData.applications.gecko.id}`);
    resolveManifest = Promise.resolve(manifestData);
  } else {
    resolveManifest = getValidatedManifest(sourceDir);
  }

  return resolveManifest
    .then((manifestData) =>
      Promise.all([
        prepareBuildDir(buildDir),
        zipDir(sourceDir),
      ])
      .then((results) => {
        let [buildDir, buffer] = results;
        let packageName = safeFileName(
          `${manifestData.name}-${manifestData.version}.xpi`);
        let extensionPath = path.join(buildDir, packageName);
        let stream = createWriteStream(extensionPath);
        let promisedStream = streamToPromise(stream);

        stream.write(buffer, () => stream.end());

        return promisedStream
          .then(() => {
            console.log(`Your web extension is ready: ${extensionPath}`);
            return {extensionPath};
          });
      })
    );
}


export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\.-]+/g, '_');
}


export function prepareBuildDir(buildDir: string): Promise {
  return fs.stat(buildDir)
    .catch(onlyErrorsWithCode('ENOENT', () => {
      console.log(`Creating build directory: ${buildDir}`);
      return fs.mkdir(buildDir);
    }))
    .then(() => buildDir);
}

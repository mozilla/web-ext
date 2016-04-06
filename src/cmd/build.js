/* @flow */
import path from 'path';
import minimatch from 'minimatch';
import {createWriteStream} from 'fs';
import streamToPromise from 'stream-to-promise';

import {zipDir} from '../util/zip-dir';
import getValidatedManifest from '../util/manifest';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';

const log = createLogger(__filename);


export default function build(
    {sourceDir, artifactsDir}: Object,
    {manifestData, fileFilter}: Object = {}): Promise {

  log.info(`Building web extension from ${sourceDir}`);

  let resolveManifest;
  if (manifestData) {
    log.debug(`Using manifest id=${manifestData.applications.gecko.id}`);
    resolveManifest = Promise.resolve(manifestData);
  } else {
    resolveManifest = getValidatedManifest(sourceDir);
  }

  if (!fileFilter) {
    fileFilter = new FileFilter();
  }

  return resolveManifest
    .then((manifestData) =>
      Promise.all([
        prepareArtifactsDir(artifactsDir),
        zipDir(sourceDir, {
          filter: (...args) => fileFilter.wantFile(...args),
        }),
      ])
      .then((results) => {
        let [artifactsDir, buffer] = results;
        let packageName = safeFileName(
          `${manifestData.name}-${manifestData.version}.xpi`);
        let extensionPath = path.join(artifactsDir, packageName);
        let stream = createWriteStream(extensionPath);
        let promisedStream = streamToPromise(stream);

        stream.write(buffer, () => stream.end());

        return promisedStream
          .then(() => {
            log.info(`Your web extension is ready: ${extensionPath}`);
            return {extensionPath};
          });
      })
    );
}


export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\.-]+/g, '_');
}


/*
 * Allows or ignores files when creating a ZIP archive.
 */
export class FileFilter {
  filesToIgnore: Array<string>;

  constructor({filesToIgnore}: Object = {}) {
    this.filesToIgnore = filesToIgnore || [
      '**/*.xpi',
      '**/*.zip',
      '**/.*', // any hidden file
    ];
  }

  /*
   * Returns true if the file is wanted for the ZIP archive.
   *
   * This is called by zipdir as wantFile(path, stat) for each
   * file in the folder that is being archived.
   */
  wantFile(path: string): boolean {
    for (const test of this.filesToIgnore) {
      if (minimatch(path, test)) {
        log.debug(`Not including file ${path} in ZIP archive`);
        return false;
      }
    }
    return true;
  }
}

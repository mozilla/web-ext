/* @flow */
import path from 'path';
import minimatch from 'minimatch';
import {createWriteStream} from 'fs';
import streamToPromise from 'stream-to-promise';

import defaultSourceWatcher from '../watcher';
import {zipDir} from '../util/zip-dir';
import getValidatedManifest from '../util/manifest';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';

const log = createLogger(__filename);


function defaultPackageCreator(
    {manifestData, sourceDir, fileFilter, artifactsDir}) {

  return new Promise(
    (resolve) => {
      if (manifestData) {
        log.debug(`Using manifest id=${manifestData.applications.gecko.id}`);
        resolve(manifestData);
      } else {
        resolve(getValidatedManifest(sourceDir));
      }
    })
    .then((manifestData) => {
      return zipDir(
        sourceDir, {
          filter: (...args) => fileFilter.wantFile(...args),
        })
        .then((buffer) => {
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
        });
    });
}


export default function build(
    {sourceDir, artifactsDir, asNeeded}: Object,
    {manifestData, fileFilter=new FileFilter({filePathsToIgnore: [path.resolve(artifactsDir)]}),
     onSourceChange=defaultSourceWatcher,
     packageCreator=defaultPackageCreator}
    : Object = {}): Promise {

  const rebuildAsNeeded = asNeeded; // alias for `build --as-needed`
  log.info(`Building web extension from ${sourceDir}`);

  const createPackage = () => packageCreator({
    manifestData, sourceDir, fileFilter, artifactsDir,
  });

  return prepareArtifactsDir(artifactsDir)
    .then(() => createPackage())
    .then((result) => {
      if (rebuildAsNeeded) {
        log.info('Rebuilding when files change...');
        onSourceChange({
          sourceDir, artifactsDir,
          onChange: () => {
            return createPackage().catch((error) => {
              log.error(error.stack);
              throw error;
            });
          },
          shouldWatchFile: (...args) => fileFilter.wantFile(...args),
        });
      }
      return result;
    });
}


export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\.-]+/g, '_');
}


/*
 * Allows or ignores files when creating a ZIP archive.
 */
export class FileFilter {
  filesToIgnore: Array<string>;
  dirToIgnore : Array<string>;
  
  constructor({filesToIgnore,filePathsToIgnore}: Object = {}) {

  constructor(artifactsDir,{filesToIgnore}: Object = {}) {
    var eliminateArtifactDir ;
    var buf = artifactsDir;
    if(typeof buf !== 'undefined' && buf.indexOf('web-ext-artifacts') != -1){
        eliminateArtifactDir = buf.slice(buf.indexOf('web-ext-artifacts').toString());
    }
    else if(typeof buf !== 'undefined' && buf.slice(-1) === '/'){
	eliminateArtifactDir = path.join(buf.slice(0,-1).toString());
    }
    else{
	eliminateArtifactDir =  path.join(buf.toString());
    }
    this.filesToIgnore = filesToIgnore || [
      '**/*.xpi',
      '**/*.zip',
      '**/.*', // any hidden file
    ];
    
    this.filePathsToIgnore = filePathsToIgnore;
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
        log.debug(`FileFilter: ignoring file ${path}`);
        return false;
      }
    }
    for (const filePath of this.filePathsToIgnore) {
      if (filePath === path){
        log.debug(`FileFilter: ignoring file ${path}`);
        return false; 
      }
    }
    return true;
  }    
  
}

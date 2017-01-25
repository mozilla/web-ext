/* @flow */
import path from 'path';

import minimatch from 'minimatch';

import {createLogger} from './logger';

const log = createLogger(__filename);

// Use this function to mimic path.resolve without resolving to absolute path.
export const normalizeResolve = (file: string): string => {
  // normalize
  file = path.normalize(file);

  // trim trailing slash
  if (path.parse(file).base && file.endsWith(path.sep)) {
    return file.slice(0, -1);
  }
  return file;
};

// FileFilter types and implementation.

export type FileFilterOptions = {|
  filesToIgnore?: Array<string>,
  ignoreFiles?: Array<string>,
  sourceDir?: string,
  artifactsDir?: string,
|};

/*
 * Allows or ignores files.
 */
export class FileFilter {
  filesToIgnore: Array<string>;
  sourceDir: string | typeof undefined;

  constructor({
    filesToIgnore = [
      '**/*.xpi',
      '**/*.zip',
      '**/.*', // any hidden file and folder
      '**/.*/**/*', // and the content inside hidden folder
      '**/node_modules',
      '**/node_modules/**/*',
    ],
    ignoreFiles = [],
    sourceDir,
    artifactsDir,
  }: FileFilterOptions = {}) {

    this.filesToIgnore = [];
    this.sourceDir = sourceDir;

    this.addToIgnoreList(filesToIgnore);
    if (ignoreFiles) {
      this.addToIgnoreList(ignoreFiles);
    }
    if (artifactsDir) {
      this.addToIgnoreList([
        artifactsDir,
        path.join(artifactsDir, '**', '*'),
      ]);
    }
  }

  /**
   *  Resolve relative path to absolute path if sourceDir is setted.
   */
  resolve(file: string): string {
    if (this.sourceDir) {
      log.debug(
        `Adding sourceDir ${this.sourceDir} to the beginning of file ${file}`
      );
      return path.resolve(this.sourceDir, file);
    }
    return normalizeResolve(file);
  }

  /**
   *  Insert more files into filesToIgnore array.
   */
  addToIgnoreList(files: Array<string>) {
    for (const file of files) {
      this.filesToIgnore.push(this.resolve(file));
    }
  }

  /*
   * Returns true if the file is wanted.
   *
   * If path does not start with a slash, it will be treated as a path
   * relative to sourceDir when matching it against all configured
   * ignore-patterns.
   *
   * This is called by zipdir as wantFile(path, stat) for each
   * file in the folder that is being archived.
   */
  wantFile(path: string): boolean {
    path = this.resolve(path);
    for (const test of this.filesToIgnore) {
      if (minimatch(path, test)) {
        log.debug(`FileFilter: ignoring file ${path} (it matched ${test})`);
        return false;
      }
    }
    return true;
  }
}

// a helper function to make mocking easier

export const createFileFilter = (
  (params: FileFilterOptions): FileFilter => new FileFilter(params)
);

export type FileFilterCreatorFn = typeof createFileFilter;

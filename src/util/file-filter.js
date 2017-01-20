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
 * Allows or ignores files when creating a ZIP archive.
 */
export class FileFilter {
  filesToIgnore: Array<string>;
  sourceDir: string;

  constructor({
    filesToIgnore = [
      '**/*.xpi',
      '**/*.zip',
      '**/.*/', // any hidden file and folder
      '**/node_modules/',
    ],
    ignoreFiles = [],
    sourceDir = '',
    artifactsDir,
  }: FileFilterOptions = {}) {

    this.filesToIgnore = [];
    this.sourceDir = sourceDir;

    this.addToIgnoreList(filesToIgnore);
    if (ignoreFiles) {
      this.addToIgnoreList(ignoreFiles);
    }
    if (artifactsDir) {
      this.addToIgnoreList([artifactsDir], true);
    }
  }

  /**
   *  Resolve relative path to absolute path if sourceDir is setted.
   */
  resolve(file: string): string {
    if (this.sourceDir) {
      return path.resolve(this.sourceDir, file);
    }
    return normalizeResolve(file);
  }

  /**
   *  Insert more files into filesToIgnore array.
   */
  addToIgnoreList(files: Array<string>, isDir: boolean = false) {
    for (const file of files) {
      this.filesToIgnore.push(this.resolve(file));
      // If file is a directory, ignore its content too.
      if (/([/\\]\.{0,2})$/.test(file) || isDir) {
        this.filesToIgnore.push(this.resolve(path.join(file, '**/*')));
      }
    }
  }

  /*
   * Returns true if the file is wanted for the ZIP archive.
   *
   * This is called by zipdir as wantFile(path, stat) for each
   * file in the folder that is being archived.
   */
  wantFile(path: string): boolean {
    path = this.resolve(path);
    for (const test of this.filesToIgnore) {
      if (minimatch(path, test)) {
        log.debug(`FileFilter: ignoring file ${path}`);
        return false;
      }
    }
    return true;
  }
}

// a helper function to make mocking easier

export type FileFilterCreatorFn = (params: FileFilterOptions) => FileFilter;

export const createFileFilter = (
  (params: FileFilterOptions): FileFilter => new FileFilter(params)
);

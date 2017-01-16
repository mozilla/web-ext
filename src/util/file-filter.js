/* @flow */
import path from 'path';

import minimatch from 'minimatch';

import {createLogger} from './logger';

const log = createLogger(__filename);

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
      '**/.*', // any hidden file
      '**/node_modules',
    ],
    ignoreFiles = [],
    sourceDir = '',
    artifactsDir,
  }: FileFilterOptions = {}) {

    this.filesToIgnore = filesToIgnore;
    this.sourceDir = sourceDir;

    if (ignoreFiles) {
      this.filesToIgnore.push(...ignoreFiles);
    }
    if (artifactsDir) {
      this.filesToIgnore.push(artifactsDir);
    }

    this.filesToIgnore = this.filesToIgnore.map(
      (file) => this.resolve(file)
    );
  }

  /**
   *  Resolve relative path to absolute path if sourceDir is setted.
   */
  resolve(file: string): string {
    if (this.sourceDir) {
      return path.resolve(this.sourceDir, file);
    }
    return file;
  }

  /**
   *  Insert more files into filesToIgnore array.
   */
  addToIgnoreList(files: Array<string>) {
    files = files.map((file) => this.resolve(file));
    this.filesToIgnore.push(...files);
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

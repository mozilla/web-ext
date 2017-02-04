/* @flow */
import path from 'path';

import minimatch from 'minimatch';

import {createLogger} from './logger';

const log = createLogger(__filename);

// check if target is a sub directory of src
export const isSubDir = (src: string, target: string): boolean => {
  const relate = path.relative(src, target);
  // same dir
  if (!relate) {
    return false;
  }
  return relate[0] !== '.';
};

// FileFilter types and implementation.

export type FileFilterOptions = {|
  baseIgnoredPatterns?: Array<string>,
  ignoreFiles?: Array<string>,
  sourceDir?: string,
  artifactsDir?: string,
|};

/*
 * Allows or ignores files.
 */
export class FileFilter {
  filesToIgnore: Array<string>;
  sourceDir: string;

  constructor({
    baseIgnoredPatterns = [
      '**/*.xpi',
      '**/*.zip',
      '**/.*', // any hidden file and folder
      '**/.*/**/*', // and the content inside hidden folder
      '**/node_modules',
      '**/node_modules/**/*',
    ],
    ignoreFiles = [],
    sourceDir = '.',
    artifactsDir,
  }: FileFilterOptions = {}) {
    sourceDir = path.resolve(sourceDir);

    this.filesToIgnore = [];
    this.sourceDir = sourceDir;

    this.addToIgnoreList(baseIgnoredPatterns);
    if (ignoreFiles) {
      this.addToIgnoreList(ignoreFiles);
    }
    if (artifactsDir && isSubDir(sourceDir, artifactsDir)) {
      artifactsDir = path.resolve(artifactsDir);
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
    log.debug(`Resolved path ${file} with sourceDir ${this.sourceDir}`);
    return path.resolve(this.sourceDir, file);
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
   * If filePath does not start with a slash, it will be treated as a path
   * relative to sourceDir when matching it against all configured
   * ignore-patterns.
   *
   * Example: this is called by zipdir as wantFile(filePath) for each
   * file in the folder that is being archived.
   */
  wantFile(filePath: string): boolean {
    const resolvedPath = this.resolve(filePath);
    for (const test of this.filesToIgnore) {
      if (minimatch(resolvedPath, test)) {
        log.debug(
          `FileFilter: ignoring file ${resolvedPath} (it matched ${test})`);
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

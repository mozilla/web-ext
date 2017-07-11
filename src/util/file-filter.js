/* @flow */
import path from 'path';

import minimatch from 'minimatch';

import {createLogger} from './logger';

const log = createLogger(__filename);

// check if target is a sub directory of src
export const isSubPath = (src: string, target: string): boolean => {
  const relate = path.relative(src, target);
  // same dir
  if (!relate) {
    return false;
  }
  if (relate === '..') {
    return false;
  }
  return !relate.startsWith(`..${path.sep}`);
};

// FileFilter types and implementation.

export type FileFilterOptions = {|
  baseIgnoredPatterns?: Array<string>,
  ignoreFiles?: Array<string>,
  sourceDir: string,
  artifactsDir?: string,
  noDefaultIgnoreFiles?: boolean
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
    sourceDir,
    artifactsDir,
    noDefaultIgnoreFiles = false,
  }: FileFilterOptions = {}) {
    sourceDir = path.resolve(sourceDir);

    this.filesToIgnore = [];
    this.sourceDir = sourceDir;

    if (!noDefaultIgnoreFiles) {
      this.addToIgnoreList(baseIgnoredPatterns);
    }
    if (ignoreFiles) {
      this.addToIgnoreList(ignoreFiles);
    }
    if (artifactsDir && isSubPath(sourceDir, artifactsDir)) {
      artifactsDir = path.resolve(artifactsDir);
      log.debug(
        `Ignoring artifacts directory "${artifactsDir}" ` +
        'and all its subdirectories'
      );
      this.addToIgnoreList([
        artifactsDir,
        path.join(artifactsDir, '**', '*'),
      ]);
    }
  }

  /**
   *  Resolve relative path to absolute path with sourceDir.
   */
  resolveWithSourceDir(file: string): string {
    const resolvedPath = path.resolve(this.sourceDir, file);
    log.debug(
      `Resolved path ${file} with sourceDir ${this.sourceDir} ` +
      `to ${resolvedPath}`
    );
    return resolvedPath;
  }

  /**
   *  Insert more files into filesToIgnore array.
   */
  addToIgnoreList(files: Array<string>) {
    for (const file of files) {
      this.filesToIgnore.push(this.resolveWithSourceDir(file));
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
    const resolvedPath = this.resolveWithSourceDir(filePath);
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

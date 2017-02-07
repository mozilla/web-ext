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
  sourceDir: ?string;

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
  }: FileFilterOptions = {}) {

    this.filesToIgnore = [];
    this.sourceDir = sourceDir;

    this.addToIgnoreList(baseIgnoredPatterns);
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
      const resolvedPath = path.resolve(this.sourceDir, file);
      log.debug(
        `Resolved path ${file} with sourceDir ${this.sourceDir || ''} ` +
        `to ${resolvedPath}`
      );
      return resolvedPath;
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

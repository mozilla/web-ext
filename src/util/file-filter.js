/* @flow */
import minimatch from 'minimatch';

import {createLogger} from './logger';

const log = createLogger(__filename);

// FileFilter types and implementation.

export type FileFilterOptions = {|
  filesToIgnore?: Array<string>,
|};

/*
 * Allows or ignores files when creating a ZIP archive.
 */
export class FileFilter {
  filesToIgnore: Array<string>;

  constructor({filesToIgnore}: FileFilterOptions = {}) {
    this.filesToIgnore = filesToIgnore || [
      '**/*.xpi',
      '**/*.zip',
      '**/.*', // any hidden file
      '**/node_modules',
    ];
  }

  /**
   *  Insert more files into filesToIgnore array.
   */
  addToIgnoreList(filesToIgnore: Array<string>) {
    this.filesToIgnore.push(...filesToIgnore);
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
    return true;
  }
}

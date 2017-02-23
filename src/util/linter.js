import path from 'path';

import {createInstance as defaultLinterCreator} from 'addons-linter';

import {
  createFileFilter as defaultFileFilterCreator,
} from './file-filter';
import {createLogger} from './logger';


const log = createLogger(__filename);

export type linterParams = {|
  sourceDir: string,
  artifactsDir: string,
  ignoreFiles?: Array<string>,
  filePath?: string | null,
  createLinter: typeof defaultLinterCreator,
|};

export async function linter(
  {
    sourceDir, artifactsDir, ignoreFiles,
    filePath = null, createLinter = defaultLinterCreator,
  }: linterParams
): Promise<void> {
  const relativePath = filePath ? [path.relative(sourceDir, filePath)]
    : filePath;
  const fileFilter = defaultFileFilterCreator({
    sourceDir, artifactsDir, ignoreFiles,
  });
  const linterInstance = createLinter({
    config: {
      logLevel: 'fatal',
      stack: true,
      pretty: true,
      warningsAsErrors: false,
      metadata: false,
      scanFile: relativePath,
      shouldScanFile: (fileName) => fileFilter.wantFile(fileName),
      // This mimics the first command line argument from yargs,
      // which should be the directory to the extension.
      _: [sourceDir],
    },
    runAsBinary: false,
  });
  return linterInstance.run();
}

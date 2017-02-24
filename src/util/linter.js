import path from 'path';

import {createInstance as defaultLinterCreator} from 'addons-linter';

import {
  createFileFilter as defaultFileFilterCreator,
} from './file-filter';


export type linterParams = {|
  sourceDir: string,
  artifactsDir: string,
  createLinter?: typeof defaultLinterCreator,
  fileFilterCreator?: typeof defaultFileFilterCreator,
  filePath?: string | null,
  ignoreFiles?: Array<string>,
|};


export type linterConfig = {|
  logLevel?: string,
  stack?: boolean,
  pretty?: boolean,
  warningsAsErrors?: boolean,
  metadata?: boolean,
  scanFile?: string | null,
  shouldScanFile?: Function | null,
|};

const defaultConfig = {
  logLevel: 'fatal',
  stack: true,
  pretty: true,
  warningsAsErrors: false,
  metadata: false,
  scanFile: null,
  shouldScanFile: null,
};

export async function linter(
  {
    sourceDir, artifactsDir, ignoreFiles = [], filePath = null,
    createLinter = defaultLinterCreator,
    fileFilterCreator = defaultFileFilterCreator,
  }: linterParams,
  additionalConfig: linterConfig = {},
): Promise<void> {
  const config = {
    ...defaultConfig,
    ...additionalConfig,
  };

  config._ = [sourceDir];

  config.scanFile = filePath ? [path.relative(sourceDir, filePath)]
    : filePath;
  if (!filePath) {
    const fileFilter = fileFilterCreator({
      sourceDir, artifactsDir, ignoreFiles,
    });
    config.shouldScanFile = (fileName) => fileFilter.wantFile(fileName);
  }

  const linterInstance = createLinter({
    config,
    runAsBinary: false,
  });
  return linterInstance.run();
}

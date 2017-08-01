/* @flow */
import path from 'path';

import {createInstance as defaultLinterCreator} from 'addons-linter';

import {createFileFilter as defaultFileFilterCreator} from './file-filter';
import type {FileFilterCreatorFn} from '../util/file-filter';


export type LinterOutputType = 'text' | 'json';

export type Linter = {|
  run: () => Promise<void>,
|};

export type LinterCreatorParams = {|
  config: {|
    logLevel: 'debug' | 'fatal',
    stack: boolean,
    pretty?: boolean,
    warningsAsErrors?: boolean,
    metadata?: boolean,
    output?: LinterOutputType,
    boring?: boolean,
    selfHosted?: boolean,
    scanFile?: ?Array<string>,
    shouldScanFile: ?ShouldScanFn,
    _: Array<string>,
  |},
  runAsBinary: boolean,
|};

export type LinterCreatorFn = (params: LinterCreatorParams) => Linter;

export type linterParams = {|
  sourceDir: string,
  artifactsDir?: string,
  ignoreFiles?: Array<string>,
  verbose?: boolean,
  filePath?: ?string,
|};

export type linterOptions = {|
  createLinter?: LinterCreatorFn,
  fileFilterCreator?: FileFilterCreatorFn,
|};

export type ShouldScanFn = (fileName: string) => boolean;

export type linterConfig = {|
  logLevel?: 'debug' | 'fatal',
  stack?: boolean,
  pretty?: boolean,
  warningsAsErrors?: boolean,
  metadata?: boolean,
  selfHosted?: boolean,
  boring?: boolean,
  output?: LinterOutputType,
  scanFile?: ?Array<string>,
  shouldScanFile?: ?ShouldScanFn,
  runAsBinary?: boolean,
|};

export async function linter(
  {
    sourceDir, artifactsDir, ignoreFiles = [], verbose = false, filePath,
  }: linterParams,
  {
    logLevel = 'fatal', stack = false, pretty = true, warningsAsErrors = false,
    metadata = false, shouldScanFile, boring = false, selfHosted = false,
    output = 'text', runAsBinary = false,
  }: linterConfig = {},
  {
    createLinter = defaultLinterCreator,
    fileFilterCreator = defaultFileFilterCreator,
  }: linterOptions = {},
): Promise<void> {

  const config = {
    _: [sourceDir],
    logLevel: verbose ? 'debug' : logLevel,
    stack: verbose ? true : stack,
    pretty,
    warningsAsErrors,
    metadata,
    selfHosted,
    output,
    boring,
    scanFile: filePath ? [path.relative(sourceDir, filePath)] : null,
    shouldScanFile,
  };

  if (!filePath && !shouldScanFile) {
    const fileFilter = fileFilterCreator({
      sourceDir, artifactsDir, ignoreFiles,
    });
    config.shouldScanFile = (fileName) => fileFilter.wantFile(fileName);
  }

  const linterInstance = createLinter({
    config,
    runAsBinary,
  });
  return linterInstance.run();
}

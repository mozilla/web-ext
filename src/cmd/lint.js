/* @flow */
import {createInstance as defaultLinterCreator} from 'addons-linter';

import {createLogger} from '../util/logger';
import {
  createFileFilter as defaultFileFilterCreator,
} from '../util/file-filter';
// import flow types
import type {FileFilterCreatorFn} from '../util/file-filter';

const log = createLogger(__filename);


// Define the needed 'addons-linter' module flow types.

export type LinterOutputType = 'text' | 'json';

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
    shouldScanFile: (fileName: string) => boolean,
    _: Array<string>,
  |},
  runAsBinary: boolean,
|};

export type Linter = {|
  run: () => Promise<void>,
|};

export type LinterCreatorFn = (params: LinterCreatorParams) => Linter;


// Lint command types and implementation.

export type LintCmdParams = {|
  artifactsDir?: string,
  boring?: boolean,
  ignoreFiles?: Array<string>,
  metadata?: boolean,
  output?: LinterOutputType,
  pretty?: boolean,
  selfHosted?: boolean,
  sourceDir: string,
  verbose?: boolean,
  warningsAsErrors?: boolean,
|};

export type LintCmdOptions = {|
  createLinter?: LinterCreatorFn,
  createFileFilter?: FileFilterCreatorFn,
  shouldExitProgram?: boolean,
|};

export default function lint(
  {
    artifactsDir,
    boring,
    ignoreFiles,
    metadata,
    output,
    pretty,
    sourceDir,
    selfHosted,
    verbose,
    warningsAsErrors,
  }: LintCmdParams,
  {
    createLinter = defaultLinterCreator,
    createFileFilter = defaultFileFilterCreator,
    shouldExitProgram = true,
  }: LintCmdOptions = {}
): Promise<void> {
  const fileFilter = createFileFilter({sourceDir, ignoreFiles, artifactsDir});

  log.debug(`Running addons-linter on ${sourceDir}`);
  const linter = createLinter({
    config: {
      logLevel: verbose ? 'debug' : 'fatal',
      stack: Boolean(verbose),
      pretty,
      warningsAsErrors,
      metadata,
      output,
      boring,
      selfHosted,
      shouldScanFile: (fileName) => fileFilter.wantFile(fileName),
      // This mimics the first command line argument from yargs,
      // which should be the directory to the extension.
      _: [sourceDir],
    },
    runAsBinary: shouldExitProgram,
  });
  return linter.run();
}

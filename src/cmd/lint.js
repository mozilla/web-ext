/* @flow */
import {createInstance as defaultLinterCreator} from 'addons-linter';
import {createLogger} from '../util/logger';
import {FileFilter} from './build';


const log = createLogger(__filename);


// Define the needed 'addons-linter' module flow types.

export type LinterOutputType = 'text' | 'json';

export type LinterCreatorParams = {
  config: {
    logLevel: 'debug' | 'fatal',
    stack: boolean,
    pretty?: boolean,
    metadata?: boolean,
    output?: LinterOutputType,
    boring?: boolean,
    selfHosted?: boolean,
    shouldScanFile: (fileName: string) => boolean,
    _: Array<string>,
  },
};

export type Linter = {
  run: () => Promise<void>,
};

export type LinterCreatorFn = (params: LinterCreatorParams) => Linter;


// Lint command types and implementation.

export type LintCmdParams = {
  sourceDir: string,
  verbose?: boolean,
  selfHosted?: boolean,
  boring?: boolean,
  output?: LinterOutputType,
  metadata?: boolean,
  pretty?: boolean,
};

export type LintCmdOptions = {
  createLinter?: LinterCreatorFn,
  fileFilter?: FileFilter,
};

export default function lint(
  {
    verbose, sourceDir, selfHosted, boring, output,
    metadata, pretty,
  }: LintCmdParams,
  {
    createLinter = defaultLinterCreator,
    fileFilter = new FileFilter(),
  }: LintCmdOptions = {}
): Promise<void> {
  log.debug(`Running addons-linter on ${sourceDir}`);
  const linter = createLinter({
    config: {
      logLevel: verbose ? 'debug' : 'fatal',
      stack: Boolean(verbose),
      pretty,
      metadata,
      output,
      boring,
      selfHosted,
      shouldScanFile: (fileName) => fileFilter.wantFile(fileName),
      // This mimics the first command line argument from yargs,
      // which should be the directory to the extension.
      _: [sourceDir],
    },
    runAsBinary: true,
  });
  return linter.run();
}

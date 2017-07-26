/* @flow */
import {createLogger} from '../util/logger';
import {linter as defaultLinter} from '../util/linter';
import type {LinterOutputType} from '../util/linter';

const log = createLogger(__filename);

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
  linter?: typeof defaultLinter,
  shouldExitProgram?: boolean,
|};

export default async function lint(
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
    linter = defaultLinter, shouldExitProgram = true,
  }: LintCmdOptions = {}
): Promise<void> {

  log.debug(`Running addons-linter on ${sourceDir}`);

  return linter({
    sourceDir, artifactsDir, ignoreFiles, verbose,
  }, {
    pretty,
    warningsAsErrors,
    metadata,
    output,
    boring,
    selfHosted,
    runAsBinary: shouldExitProgram,
  });
}

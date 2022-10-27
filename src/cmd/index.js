/* @flow */

import type {
  BuildCmdParams,
  BuildCmdOptions,
  ExtensionBuildResult,
} from './build.js';
import type { LintCmdParams, LintCmdOptions } from './lint.js';
import type { CmdRunParams, CmdRunOptions } from './run.js';
import type { MultiExtensionRunner } from '../extension-runners/index.js';
import type { SignParams, SignOptions, SignResult } from './sign.js';
import type { DocsParams, DocsOptions } from './docs.js';

// This module exports entry points for all supported commands. For performance
// reasons (faster start-up), the implementations are not statically imported
// at the top of the file, but lazily loaded in the (exported) functions.
// The latter would slow down start-up by several seconds, as seen in #1302 .

async function build(
  params: BuildCmdParams,
  options: BuildCmdOptions
): Promise<ExtensionBuildResult> {
  const { default: runCommand } = await import('./build.js');
  return runCommand(params, options);
}

async function lint(
  params: LintCmdParams,
  options: LintCmdOptions
): Promise<void> {
  const { default: runCommand } = await import('./lint.js');
  return runCommand(params, options);
}

async function run(
  params: CmdRunParams,
  options: CmdRunOptions
): Promise<MultiExtensionRunner> {
  const { default: runCommand } = await import('./run.js');
  return runCommand(params, options);
}

async function sign(
  params: SignParams,
  options: SignOptions
): Promise<SignResult> {
  const { default: runCommand } = await import('./sign.js');
  return runCommand(params, options);
}

async function docs(params: DocsParams, options: DocsOptions): Promise<void> {
  const { default: runCommand } = await import('./docs.js');
  return runCommand(params, options);
}

export default { build, lint, run, sign, docs };

/* @flow */

import type {
  BuildCmdParams, BuildCmdOptions, ExtensionBuildResult,
} from './build';
import type {LintCmdParams, LintCmdOptions} from './lint';
import type {CmdRunParams, CmdRunOptions} from './run';
import type {MultiExtensionRunner} from '../extension-runners';
import type {SignParams, SignOptions, SignResult} from './sign';
import type {DocsParams, DocsOptions} from './docs';

// This module exports entry points for all supported commands. For performance
// reasons (faster start-up), the implementations are not statically imported
// at the top of the file, but lazily loaded in the (exported) functions.
// The latter would slow down start-up by several seconds, as seen in #1302 .

async function build(
  params: BuildCmdParams, options: BuildCmdOptions
): Promise<ExtensionBuildResult> {
  // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
  const {default: runCommand} = require('./build');
  return runCommand(params, options);
}

async function lint(
  params: LintCmdParams, options: LintCmdOptions
): Promise<void> {
  // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
  const {default: runCommand} = require('./lint');
  return runCommand(params, options);
}

async function run(
  params: CmdRunParams, options: CmdRunOptions
): Promise<MultiExtensionRunner> {
  // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
  const {default: runCommand} = require('./run');
  return runCommand(params, options);
}

async function sign(
  params: SignParams, options: SignOptions
): Promise<SignResult> {
  // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
  const {default: runCommand} = require('./sign');
  return runCommand(params, options);
}

async function docs(
  params: DocsParams, options: DocsOptions
): Promise<void> {
  // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
  const {default: runCommand} = require('./docs');
  return runCommand(params, options);
}

export default {build, lint, run, sign, docs};

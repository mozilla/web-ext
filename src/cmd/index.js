// This module exports entry points for all supported commands. For performance
// reasons (faster start-up), the implementations are not statically imported
// at the top of the file, but lazily loaded in the (exported) functions.
// The latter would slow down start-up by several seconds, as seen in #1302 .

async function build(params, options) {
  const { default: runCommand } = await import('./build.js');
  return runCommand(params, options);
}

async function lint(params, options) {
  const { default: runCommand } = await import('./lint.js');
  return runCommand(params, options);
}

async function run(params, options) {
  const { default: runCommand } = await import('./run.js');
  return runCommand(params, options);
}

async function sign(params, options) {
  const { default: runCommand } = await import('./sign.js');
  return runCommand(params, options);
}

async function docs(params, options) {
  const { default: runCommand } = await import('./docs.js');
  return runCommand(params, options);
}

export default { build, lint, run, sign, docs };

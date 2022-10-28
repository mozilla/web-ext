import { spawnSync } from 'child_process';

import shell from 'shelljs';

import config from './config.js';

// Get the explicit path (needed on CI windows workers).
function which(...args) {
  return String(shell.which(...args));
}

const runMocha = (args, execMochaOptions = {}, coverageEnabled) => {
  const mochaPath = which('mocha');
  const binArgs = coverageEnabled ? [mochaPath, ...args] : args;
  const binPath = coverageEnabled ? which('nyc') : mochaPath;

  if (process.env.MOCHA_TIMEOUT) {
    const { MOCHA_TIMEOUT } = process.env;
    binArgs.push('--timeout', MOCHA_TIMEOUT);
    shell.echo(`\nSetting mocha timeout from env var: ${MOCHA_TIMEOUT}\n`);
  }

  // Pass custom babel-loader node loader to transpile on the fly
  // the tests modules.
  binArgs.push('-n="loader=./tests/babel-loader.js"');

  const res = spawnSync(binPath, binArgs, {
    ...execMochaOptions,
    env: {
      ...process.env,
      // Make sure NODE_ENV is set to test (which also enable babel
      // install plugin for all modules transpiled on the fly by the
      // tests/babel-loader.js).
      NODE_ENV: 'test',
    },
    stdio: 'inherit',
  });

  if (res.error) {
    console.error(res.error);
    return false;
  }

  return res.status === 0;
};

export const mochaUnit = (execMochaOptions, coverageEnabled) => {
  return runMocha(config.mocha.unit, execMochaOptions, coverageEnabled);
};

export const mochaFunctional = (execMochaOptions) => {
  return runMocha(config.mocha.functional, execMochaOptions);
};

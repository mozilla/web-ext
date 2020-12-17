const spawnSync = require('child_process').spawnSync;

const shell = require('shelljs');

const config = require('./config');

// Get the explicit path (needed on CI windows workers).
function which(...args) {
  return String(shell.which(...args));
}

const runMocha = (args, execMochaOptions = {}, coverageEnabled) => {
  const mochaPath = which('mocha');
  const binArgs = coverageEnabled ? [mochaPath, ...args] : args;
  const binPath = coverageEnabled ? which('nyc') : mochaPath;

  if (process.env.MOCHA_TIMEOUT) {
    const {MOCHA_TIMEOUT} = process.env;
    binArgs.push('--timeout', MOCHA_TIMEOUT);
    shell.echo(`\nSetting mocha timeout from env var: ${MOCHA_TIMEOUT}\n`);
  }

  const res = spawnSync(binPath, binArgs, {
    ...execMochaOptions,
    stdio: 'inherit',
  });

  if (res.error) {
    console.error(res.error);
    return false;
  }

  return res.status === 0;
};

exports.mochaUnit = (execMochaOptions, coverageEnabled) => {
  return runMocha(config.mocha.unit, execMochaOptions, coverageEnabled);
};

exports.mochaFunctional = (execMochaOptions) => {
  return runMocha(config.mocha.functional, execMochaOptions);
};

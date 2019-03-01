const spawnSync = require('child_process').spawnSync;

const shell = require('shelljs');

const config = require('./config');

// Get the explicit path to mocha (needed to make it find mocha binary on travis windows workers).
const mochaPath = String(shell.which('mocha'));

const runMocha = (args, execMochaOptions = {}) => {
  const res = spawnSync(mochaPath, args, {
    ...execMochaOptions,
    stdio: 'inherit',
  });

  if (res.error) {
    console.error(res.error);
    return false;
  }

  return res.status === 0;
};

exports.mochaUnit = (execMochaOptions) => {
  return runMocha(config.mocha.unit, execMochaOptions);
};

exports.mochaFunctional = (execMochaOptions) => {
  return runMocha(config.mocha.functional, execMochaOptions);
};

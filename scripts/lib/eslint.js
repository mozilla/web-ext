const {CLIEngine} = require('eslint');

const config = require('./config');

const eslint = new CLIEngine();

module.exports = () => {
  const lint = eslint.executeOnFiles(config.eslint.files);

  console.log(eslint.getFormatter()(lint.results));

  if (lint.errorCount > 0) {
    return false;
  }

  return true;
};

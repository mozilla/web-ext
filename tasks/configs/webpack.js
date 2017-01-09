var path = require('path');

var webpackConfig = require('../../webpack.config.js');


module.exports = {
  options: webpackConfig,
  build: {},
  unit_tests: {
    entry: './tests/unit/runner.js',
    output: {
      path: path.join(__dirname, '../../dist'),
      filename: 'unit-tests.js',
    },
  },
  functional_tests: {
    entry: './tests/functional/runner.js',
    output: {
      path: path.join(__dirname, '../../dist'),
      filename: 'functional-tests.js',
    },
  },
};

var path = require('path');
var webpackConfig = require('../webpack.config.js');


module.exports = {
  options: webpackConfig,
  build: {},
  test: {
    entry: './tests/unit/runner.js',
    output: {
      path: path.join(__dirname, '../dist'),
      filename: 'tests.js',
    },
  },
  smoke: {
    entry: './tests/smoke/runner.js',
    output: {
      path: path.join(__dirname, '../dist'),
      filename: 'smoke-tests.js',
    },
  },
};

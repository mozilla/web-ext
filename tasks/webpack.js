var grunt = require('grunt');
var path = require('path');
var webpackConfig = require('../webpack.config.js');

var defaultResolve = webpackConfig.resolve;

function noddyClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

var buildResolve = noddyClone(defaultResolve);
buildResolve.modulesDirectories.push('src/');

var testConfig = {
  entry: './tests/runner.js',
  output: {
    path: path.join(__dirname, '../dist'),
    filename: 'tests.js',
  },
};

module.exports = {
  options: webpackConfig,
  build: {
    resolve: buildResolve,
  },
  watchBuild: {
    watch: true,
    keepalive: true,
    resolve: buildResolve,
  },
  test: {
    entry: testConfig.entry,
    output: testConfig.output,
    resolve: buildResolve,
  },
};

/*eslint prefer-template: 0*/
var path = require('path');
var fs = require('fs');

var webpack = require('webpack');

var nodeModules = {};

// This is to filter out node_modules as we don't want them
// to be made part of any bundles.
fs.readdirSync('node_modules')
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });

var preLoaders = [];

if (process.env.COVERAGE === 'y') {
  preLoaders.push([
    {
      test: /\.js$/,
      exclude: /(node_modules|bower_components|test)/,
      loader: 'babel-istanbul',
    },
  ]);
}

module.exports = {
  entry: './src/main.js',
  target: 'node',
  node: {
    __dirname: true,
    __filename: true,
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'web-ext.js',
    libraryTarget: 'commonjs2',
  },
  module: {
    preLoaders,
    loaders: [
      {
        exclude: /(node_modules|bower_components)/,
        test: /\.js$/,
        // babel options are in .babelrc
        loaders: ['babel'],
      },
    ],
  },
  externals: nodeModules,
  plugins: [
    new webpack.BannerPlugin('require("source-map-support").install();',
                             { raw: true, entryOnly: false }),
    // This seems necessary to work with the 'when' module, which is
    // required by some things such as fx-runner.
    new webpack.IgnorePlugin(/vertx/),
    // Global variables are necessary to print either verson number or
    // git commit information for custom builds
    new webpack.DefinePlugin({
      WEBEXT_BUILD_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
    }),
  ],
  resolve: {
    extensions: ['', '.js', '.json'],
    modulesDirectories: [
      'src',
      'node_modules',
    ],
  },
  devtool: 'sourcemap',
};

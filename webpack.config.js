var webpack = require('webpack');
var path = require('path');
var fs = require('fs');

var nodeModules = {};

// This is to filter out node_modules as we don't want them
// to be made part of any bundles.
fs.readdirSync('node_modules')
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    // jscs:disable requireTemplateStrings
    nodeModules[mod] = 'commonjs ' + mod;
    // jscs:enable requireTemplateStrings
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
    preLoaders: preLoaders,
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

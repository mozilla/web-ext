/*eslint prefer-template: 0*/
var path = require('path');

var webpack = require('webpack');

var nodeModules = {};

// Do not bundle any external module, because those are explicitly added as
// "dependencies" in package.json. Bundling them anyway could result in bugs
// like https://github.com/mozilla/web-ext/issues/1629
Object.keys(require('./package.json').dependencies)
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });

// Allow use of importing parts of an external module, without bundling them.
function nodeModulesExternalsHandler(context, request, callback) {
  var mod = request.split('/', 1)[0];
  if (Object.prototype.hasOwnProperty.call(nodeModules, mod)) {
    callback(null, 'commonjs ' + request);
    return;
  }
  callback();
}

var rules = [
  {
    exclude: /(node_modules|bower_components)/,
    test: /\.js$/,
    // babel options are in .babelrc
    loaders: ['babel-loader'],
  },
];

module.exports = {
  mode: process.env.NODE_ENV && process.env.NODE_ENV !== 'test' ?
    process.env.NODE_ENV : 'development',
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
    rules,
  },
  externals: [
    nodeModules,
    nodeModulesExternalsHandler,
  ],
  plugins: [
    new webpack.BannerPlugin({
      banner: 'require("source-map-support").install();',
      raw: true,
      entryOnly: false,
    }),
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
    extensions: ['.js', '.json'],
    modules: [
      path.join(__dirname, 'src'),
      path.resolve(__dirname, 'node_modules'),
    ],
  },
  devtool: 'sourcemap',
};

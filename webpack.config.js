/*eslint prefer-template: 0*/
var path = require('path');

var webpack = require('webpack');
// Do not bundle any external module, because those are explicitly added as
// "dependencies" in package.json. Bundling them anyway could result in bugs
// like https://github.com/mozilla/web-ext/issues/1629
var nodeExternals = require('webpack-node-externals');

var rules = [
  {
    exclude: /(node_modules|bower_components)/,
    test: /\.js$/,
    // babel options are in .babelrc
    loader: 'babel-loader',
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
    // Force webpack bundled module to export the content
    // of the default export.
    libraryExport: 'default',
  },
  module: {
    rules,
  },
  externals: [
    nodeExternals({
      modulesFromFile: {
        // We shouldn't bundle devDependencies. E.g. git-rev-sync would be
        // bundled if we omitted "devDependencies" from this list, which is
        // undesired because the branch is never reached on production, so it
        // is intentionally part of devDependencies to avoid the unnecessary
        // dependency and bundling on production.
        excludeFromBundle: ['dependencies', 'devDependencies'],
      },
    }),
  ],
  plugins: [
    new webpack.BannerPlugin({
      banner: 'require("source-map-support").install();',
      raw: true,
      entryOnly: false,
    }),
    // This seems necessary to work with the 'when' module, which is
    // required by some things such as fx-runner.
    new webpack.IgnorePlugin({ resourceRegExp: /vertx/ }),
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
  devtool: 'source-map',
};

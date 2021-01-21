const webpack = require('webpack');

module.exports = () => {
  return new Promise((resolve, reject) => {
    webpack(require('../../webpack.config.js'), (err, stats) => {
      if (err || stats.hasErrors()) {
        console.error('Webpack build errors', err || stats);
        reject(err || stats);
      } else {
        console.log(stats.toString({
          chunks: false, // Makes the build much quieter
          colors: true, // Shows colors in the console
        }));
        resolve(stats);
      }
    });
  });
};

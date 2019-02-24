const webpack = require('webpack');

module.exports = () => {
  return new Promise((resolve, reject) => {
    webpack(require('../../webpack.config.js')).run((err, stats) => {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        console.log(stats.toString({
          chunks: false, // Makes the build much quieter
          colors: true, // Shows colors in the console
        }));

        stats.hasErrors() ? reject(stats) : resolve(stats);
      }
    });
  });
};

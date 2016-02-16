module.exports = {
  js: {
    options: {
      config: '.jscsrc',
    },
    files: [
      { src: [
          'tasks/**/*.js',
          'tests/**/*.js',
          'src/**/*.js',
          'Gruntfile.js',
          'webpack.config.js',
        ],
      },
    ],
  },
};

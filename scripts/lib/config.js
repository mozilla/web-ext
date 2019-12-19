module.exports = {
  clean: ['dist/*'],
  watch: {
    files: [
      'package.json',
      'webpack.config.js',
      '.flowconfig',
    ],
    dirs: [
      'src',
      'tests',
      'scripts',
    ],
  },
  eslint: {
    files: [
      '.', './src/**/*.js', './tests/**/*.js', './scripts/**',
    ],
  },
  mocha: {
    unit: [
      './tests/unit/test.setup.js', './tests/unit/test.*.js', './tests/unit/**/test.*.js',
    ],
    functional: [
      'tests/functional/test.*.js',
    ],
  },
};

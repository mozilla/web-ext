export default {
  clean: ['lib/*'],
  watch: {
    files: ['package.json', 'webpack.config.js'],
    dirs: ['src', 'tests', 'scripts'],
  },
  eslint: {
    files: [
      '.',
      './index.js',
      './src/**/*.js',
      './tests/**/*.js',
      './scripts/**',
    ],
  },
  mocha: {
    unit: [
      './tests/unit/test.setup.js',
      './tests/unit/test.*.js',
      './tests/unit/**/test.*.js',
    ],
    functional: ['tests/functional/test.*.js'],
  },
};

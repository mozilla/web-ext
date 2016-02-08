module.exports = {
  options: {
    atBegin: true,
    interrupt: true,
  },
  develop: {
    files: [
      'tasks/**/*.js*',
      'src/**/*.js',
      'webpack.config.js',
      'tests/**/*.js*',
    ],
    tasks: [
      'build-tests',
      'mochaTest',
      'lint',
      'flow:server:status',
    ],
  },
};

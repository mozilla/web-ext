// All the files that might affect the distributed source code.
var srcFiles = [
  'tasks/**/*.js*',
  'src/**/*.js',
  'webpack.config.js',
];

module.exports = {
  options: {
    atBegin: true,
    interrupt: true,
  },
  develop: {
    files: srcFiles.concat([
      'tests/**/*.js*',
    ]),
    tasks: ['test', 'flow:server:status'],
  },
};

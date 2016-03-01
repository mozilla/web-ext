module.exports = {
  options: {
    timeout: 1000,
    reporter: 'mocha-multi',
    reporterOptions: {
      spec: '-',
    },
  },
  all: ['dist/tests.js'],
};

if (process.env.COVERAGE === 'y') {
  var path = require('path');

  var coverageReporterModulePath = path.resolve(
    path.join(__dirname, '..', 'tests', 'coverage-reporter.js')
  );

  module.exports.options.reporterOptions[coverageReporterModulePath] = '-';
}

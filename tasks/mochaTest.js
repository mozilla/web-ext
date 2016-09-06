module.exports = {
  options: {
    // On TravisCI, sometimes the tests that require I/O need extra time.
    timeout: 10000,
    reporter: 'mocha-multi',
    reporterOptions: {
      spec: '-',
    },
  },
  all: ['dist/tests.js'],
  smoke: ['dist/smoke-tests.js'],
};

if (process.env.COVERAGE === 'y') {
  var path = require('path');

  var coverageReporterModulePath = path.resolve(
    path.join(__dirname, '..', 'tests', 'coverage-reporter.js')
  );

  module.exports.options.reporterOptions[coverageReporterModulePath] = '-';
}

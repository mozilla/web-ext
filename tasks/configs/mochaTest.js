module.exports = {
  options: {
    // On TravisCI, sometimes the tests that require I/O need extra time.
    timeout: 10000,
    reporter: 'mocha-multi',
    reporterOptions: {
      spec: '-',
    },
  },
  unit: ['dist/unit-tests.js'],
  functional: ['dist/functional-tests.js'],
};

if (process.env.COVERAGE === 'y') {
  var path = require('path');

  var coverageReporterModulePath = path.resolve(
    path.join(__dirname, '..', '..', 'tests', 'coverage-reporter.js')
  );

  module.exports.options.reporterOptions[coverageReporterModulePath] = '-';
}

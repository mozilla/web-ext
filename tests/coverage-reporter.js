module.exports = function CoverageReporter(runner) {
  runner.on('end', function() {
    // generate the coverage reports
    var istanbul = require('babel-istanbul');
    var collector = new istanbul.Collector();
    var reporter = new istanbul.Reporter();
    var sync = true;

    collector.add(global.__coverage__);

    reporter.addAll([ 'text', 'text-summary', 'lcov' ]);
    reporter.write(collector, sync, function() {
      // eslint-disable-next-line no-console
      console.log('All coverage reports generated');
    });
  });
};

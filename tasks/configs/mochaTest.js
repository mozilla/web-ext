module.exports = {
  options: {
    // On TravisCI, sometimes the tests that require I/O need extra time
    // (even more when running in a travis windows worker).
    timeout: process.env.TRAVIS_OS_NAME === 'windows' ? 30000 : 10000,
    reporter: 'mocha-multi',
    reporterOptions: {
      spec: '-',
    },
    require: [
      '@babel/register',
      './tests/setup',
    ],
  },
  unit: ['./tests/unit/test.setup.js', './tests/unit/**/test.*.js'],
  functional: ['./tests/functional/**/test.*.js'],
};

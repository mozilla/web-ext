module.exports = {
  // On TravisCI, sometimes the tests that require I/O need extra time
  // (even more when running in a travis windows worker).
  timeout: process.env.TRAVIS_OS_NAME === 'windows' ? 30000 : 10000,
  diff: true,
  package: './package.json',
  reporter: 'spec',
  require: [
    '@babel/register',
    './tests/setup',
  ]
};

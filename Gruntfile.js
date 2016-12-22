/*eslint prefer-template: 0*/
module.exports = function(grunt) {

  // Looking for something?
  // The source of a grunt task or its configuration might be in:
  // 1. this file :)
  // 2. ./node_modules/grunt-*<task_name>/
  // 3. ./tasks/<task_name>.js


  // This loads all grunt tasks matching the grunt-*, @*/grunt-* patterns.
  require('load-grunt-tasks')(grunt);

  var configs = require('load-grunt-configs')(grunt, {
    config: {
      src: 'tasks/*.js',
    },
  });
  grunt.initConfig(configs);

  grunt.registerTask('build', [
    'clean',
    'webpack:build',
  ]);

  grunt.registerTask('build-tests', [
    'build',
    'webpack:unit_tests',
    'webpack:functional_tests',
  ]);

  grunt.registerTask('test', [
    'lint',
    'flowbin:check',
    'build-tests',
    'mochaTest:unit',
    'mochaTest:functional',
  ]);

  grunt.registerTask('develop', [
    'flowbin:start',
    'watch:develop',
  ]);

  grunt.registerTask('lint', 'checks for syntax errors', function() {
    if (process.env.SKIP_LINT) {
      grunt.log.writeln('lint task skipped because of $SKIP_LINT');
    } else {
      grunt.task.run([
        'eslint',
      ]);
    }
  });

  grunt.registerTask(
    'travisPullRequestTitleLinting',
    'get the pull request title in a travis build', function() {
      if (process.env.TRAVIS_PULL_REQUEST &&
          process.env.TRAVIS_PULL_REQUEST !== 'false') {
        var done = this.async();

        // Install ES6/ES7 polyfills required to use changelog-lint programmatically.
        if (!Object.values) {
          require('object.values').shim();
        }
        if (!Object.entries) {
          require('object.entries').shim();
        }

        var pullRequestURLPath = '/repos/' + process.env.TRAVIS_REPO_SLUG +
          /pulls/ + process.env.TRAVIS_PULL_REQUEST + '.json';

        grunt.log.writeln(
          'Retrieving the pull request title from https://api.github.com' +
          pullRequestURLPath
        );

        require('https').get({
          host: 'api.github.com',
          path: pullRequestURLPath,
          headers: {
            'User-Agent': 'mozilla web-ext grunt tasks',
          },
        }, function(response) {
          var body = '';
          response.on('data', function(data) {
            body += data;
          });
          response.on('error', function(err) {
            grunt.log.writeln('Failed during pull request title download: ' +
                              err);

            done(false);
          });
          response.on('end', function() {
            var parsed = JSON.parse(body);

            grunt.log.writeln('Retrieved pull request title: ' + parsed.title);

            var changelogLintPkg = require('conventional-changelog-lint');
            var changelogLint = changelogLintPkg.default;
            var getPreset = changelogLintPkg.getPreset;
            var getConfiguration = changelogLintPkg.getConfiguration;

            Promise.all([
              getPreset('angular'),
              getConfiguration('.conventional-changelog-lintrc'),
            ]).then(([preset, configuration]) => {
              return changelogLint(parsed.title, {preset, configuration});
            }).then((report) => {
              grunt.log.writeln('changelog lint report: ' +
                                JSON.stringify(report, null, 2));

              done(report.valid);
            }).catch((err) => {
              grunt.log.writeln('Failed running changelog-lint: ' + err);

              done(false);
            });
          });
        });
      }
    });
};

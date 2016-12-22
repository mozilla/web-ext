var changelogLintPkg = require('conventional-changelog-lint');
var exec = require('child_process').exec;
var https = require('https');
var objectValues = require('object.values');
var objectEntries = require('object.entries');

var changelogLint = changelogLintPkg.default;
var getPreset = changelogLintPkg.getPreset;
var getConfiguration = changelogLintPkg.getConfiguration;
var format = changelogLintPkg.format;

module.exports = function (grunt) {
  function countGitMergeCommits() {
    return new Promise(function (resolve, reject) {
      exec('git rev-list --count HEAD ^master', function (err, stdout) {
        if (err) {
          reject(err);
        } else {
          resolve(parseInt(stdout));
        }
      });
    });
  }

  function getGitLastCommitMessage() {
    return new Promise(function (resolve, reject) {
      exec('git show -s --format=%B HEAD', function (err, stdout) {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  function getPullRequestTitle() {
    return new Promise(function (resolve, reject) {
      var pullRequestURLPath = '/repos/' + process.env.TRAVIS_REPO_SLUG +
        /pulls/ + process.env.TRAVIS_PULL_REQUEST + '.json';

      grunt.log.writeln(
        'Retrieving the pull request title from https://api.github.com' +
          pullRequestURLPath
      );

      https.get({
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
          reject(err);
        });
        response.on('end', function() {
          try {
            resolve(JSON.parse(body).title);
          } catch (err) {
            reject(err);
          }
        });
      });
    });
  }

  function lintMessage(message) {
    return new Promise(function (resolve, reject) {
      return Promise.all([
        getPreset('angular'),
        getConfiguration('.conventional-changelog-lintrc'),
      ]).then((results) => {
        var preset = results[0];
        var configuration = results[1];

        grunt.log.writeln("Changelog lint input: " + message);
        return changelogLint(message, {preset, configuration});
      }).then((report) => {
        const formatted = format(report, {
          color: true,
          signs: [' ', '⚠', '✖'],
          colors: ['white', 'yellow', 'red']
        }).join('\n');

        if (report.valid) {
          resolve(formatted);
        } else {
          reject(formatted);
        }
      });
    });
  }

  var writeCommitMessagesDocURL =
        'https://github.com/mozilla/web-ext/blob/master/CONTRIBUTING.md#writing-commit-messages';

  grunt.registerTask(
    'travis-pr-title-lint',
    'get the pull request title in a travis build', function() {
      if (process.env.TRAVIS_PULL_REQUEST &&
          process.env.TRAVIS_PULL_REQUEST !== 'false') {
        var done = this.async();

        // Install ES6/ES7 polyfills required to use changelog-lint programmatically.
        if (!Object.values) {
          objectValues.shim();
        }
        if (!Object.entries) {
          objectEntries.shim();
        }

        countGitMergeCommits().then(function (commitsCount) {
          if (commitsCount == 1) {
            grunt.log.writeln('There is only one commit in this pull request, ' +
                              'we are going to check the single commit message...');
            return getGitLastCommitMessage().then(lintMessage);
          } else {
            grunt.log.writeln('There is more than one commit in this pull request, ' +
                              'we are going to check the pull request title...');
            return getPullRequestTitle().then(lintMessage);
          }
        }).then(function () {
          grunt.log.writeln('Changelog linting completed successfully.');
          done(true);
        }).catch(function (err) {
          var errMessage = err.stack ? err.stack : err;
          grunt.log.writeln('Failures during changelog linting the pull request:\n' + errMessage);

          grunt.log.writeln(
            '\nDon\'t panic! If your travis build is failing here, ' +
              'please take a look at \n\n' +
              ' - ' + writeCommitMessagesDocURL + '\n\n' +
              'and/or mention in a comment one of the mantainers, we are here to help ;-)'
          );
          done(false);
        });
      }
    });
};

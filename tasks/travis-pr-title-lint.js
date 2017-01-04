/* eslint prefer-template: 0, no-console: 0 */

var exec = require('child_process').exec;
var https = require('https');

var changelogLintPkg = require('conventional-changelog-lint');
var objectValues = require('object.values');
var objectEntries = require('object.entries');


var changelogLint = changelogLintPkg.default;
var getPreset = changelogLintPkg.getPreset;
var getConfiguration = changelogLintPkg.getConfiguration;
var format = changelogLintPkg.format;

var writeCommitMessagesDocURL =
  'https://github.com/mozilla/web-ext/blob/master' +
  '/CONTRIBUTING.md#writing-commit-messages';

module.exports = function(grunt) {
  function findMergeBase() {
    return new Promise(function(resolve, reject) {
      exec('git merge-base HEAD master', function(err, stdout) {
        if (err) {
          reject(err);
        } else {
          var baseCommit = stdout.trim();
          if (process.env.VERBOSE === 'true') {
            console.log('DEBUG findMergeBase:', baseCommit);
          }
          resolve(baseCommit);
        }
      });
    });
  }

  function getGitBranchCommits() {
    return new Promise(function(resolve, reject) {
      findMergeBase().then(function(baseCommit) {
        var gitCommand = 'git rev-list --no-merges HEAD ^' + baseCommit;
        exec(gitCommand, function(err, stdout) {
          if (err) {
            reject(err);
          } else {
            var commits = stdout.trim().split('\n');
            if (process.env.VERBOSE === 'true') {
              console.log('DEBUG getGitBranchCommits:', commits);
            }
            resolve(commits);
          }
        });
      }, reject);
    });
  }

  function getGitCommitMessage(commitSha1) {
    return new Promise(function(resolve, reject) {
      exec('git show -s --format=%B ' + commitSha1, function(err, stdout) {
        if (err) {
          reject(err);
        } else {
          var commitMessage = stdout.trim();
          if (process.env.VERBOSE === 'true') {
            console.log('DEBUG getGitCommitMessage:',
                        '"' + commitMessage + '"');
          }
          resolve(commitMessage);
        }
      });
    });
  }

  function getPullRequestTitle() {
    return new Promise(function(resolve, reject) {
      var pullRequestURLPath = '/repos/' +
        process.env.TRAVIS_REPO_SLUG + '/pulls/' +
        process.env.TRAVIS_PULL_REQUEST + '.json';

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
          grunt.log.writeln(
            'Failed during pull request title download: ' +
            err
          );
          reject(err);
        });
        response.on('end', function() {
          try {
            var prData = JSON.parse(body);
            if (process.env.VERBOSE === 'true') {
              console.log('DEBUG getPullRequestTitle:',
                          JSON.stringify(prData, null, 2));
            }
            resolve(prData.title);
          } catch (err) {
            reject(err);
          }
        });
      });
    });
  }

  function lintMessage(message) {
    return new Promise(function(resolve, reject) {
      if (!message) {
        reject(new Error('Unable to lint an empty message.'));
        return;
      }

      Promise.all([
        getPreset('angular'),
        getConfiguration('.conventional-changelog-lintrc'),
      ]).then(function(results) {
        var preset = results[0];
        var configuration = results[1];

        grunt.log.writeln('\nChangelog lint input: "' + message + '"');

        return changelogLint(message, {preset, configuration});
      }).then(function(report) {
        const formatted = format(report, {
          color: true,
          signs: [' ', '⚠', '✖'],
          colors: ['white', 'yellow', 'red'],
        }).join('\n');

        if (report.valid) {
          resolve(formatted);
        } else {
          reject(formatted);
        }
      }).catch(function(err) {
        // Catch and reject explicitly any rejection in the above
        // Promise chain.
        reject(err);
      });
    });
  }

  grunt.registerTask(
    'travis-pr-title-lint',
    'get the pull request title in a travis build', function() {
      if (process.env.TRAVIS_PULL_REQUEST &&
          process.env.TRAVIS_PULL_REQUEST !== 'false') {
        var done = this.async();

        // Install ES6/ES7 polyfills required to use changelog-lint
        // programmatically.
        if (!Object.values) {
          objectValues.shim();
        }
        if (!Object.entries) {
          objectEntries.shim();
        }

        getGitBranchCommits()
          .then(function(commits) {
            if (commits.length === 1) {
              grunt.log.writeln(
                'There is only one commit in this pull request, ' +
                'we are going to check the single commit message...'
              );
              return getGitCommitMessage(commits[0]).then(lintMessage);
            } else {
              grunt.log.writeln(
                'There is more than one commit in this pull request, ' +
                'we are going to check the pull request title...'
              );

              return getPullRequestTitle()
                .then(function(pullRequestTitle) {
                  if (!pullRequestTitle) {
                    grunt.log.writeln(
                      'Got an empty pull request title from the github API. ' +
                      'Retrying one more time...'
                    );

                    return getPullRequestTitle();
                  }

                  return pullRequestTitle;
                })
                .then(lintMessage);
            }
          })
          .then(function() {
            grunt.log.writeln('Changelog linting completed successfully.');
            done(true);
          })
          .catch(function(err) {
            var errMessage = err.stack ? err.stack : err;
            grunt.log.writeln(
              'Failures during changelog linting the pull request:\n' +
              errMessage
            );

            grunt.log.writeln(
              '\nDon\'t panic! If your travis build is failing here, ' +
              'please take a look at \n\n' +
              ' - ' + writeCommitMessagesDocURL + '\n\n' +
              'and feel free to ask for help from one of the maintainers ' +
              'in a comment; we are here to help ;-)'
            );
            done(false);
          });
      }
    });
};

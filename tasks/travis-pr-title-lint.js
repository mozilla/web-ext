/* eslint prefer-template: 0, no-console: 0 */

var exec = require('child_process').exec;
var path = require('path');
var https = require('https');

var changelogLintPkg = require('conventional-changelog-lint');
var fs = require('mz').fs;
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
      var pullRequestURLPath = '/' +
        process.env.TRAVIS_REPO_SLUG + '/pull/' +
        process.env.TRAVIS_PULL_REQUEST;

      grunt.log.writeln(
        'Retrieving the pull request title from https://github.com' +
        pullRequestURLPath
      );

      var req = https.get({
        host: 'github.com',
        path: pullRequestURLPath,
        headers: {
          'User-Agent': 'GitHub... your API can be very annoying ;-)',
        },
      }, function(response) {
        if (response.statusCode < 200 || response.statusCode > 299) {
          reject(new Error('Unexpected statusCode: ' + response.statusCode));
          return;
        }

        var body = '';
        response.on('data', function(data) {
          try {
            body += data;

            // Once we get the closing title tag, we can read
            // the pull request title and
            if (body.includes('</title>')) {
              response.removeAllListeners('data');
              response.emit('end');

              var titleStart = body.indexOf('<title>');
              var titleEnd = body.indexOf('</title>');

              // NOTE: page slice is going to be something like:
              // "<title> PR title by author · Pull Request #NUM · mozilla/web-ext · GitHub"
              var pageTitleParts = body.slice(titleStart, titleEnd)
                .replace('<title>', '')
                .split(' · ');

              // Check that we have really got the title of a real pull request.
              var expectedPart1 = 'Pull Request #' +
                process.env.TRAVIS_PULL_REQUEST;

              if (pageTitleParts[1] === expectedPart1) {
                // Remove the "by author" part.
                var prTitleEnd = pageTitleParts[0].lastIndexOf(' by ');
                resolve(pageTitleParts[0].slice(0, prTitleEnd));
              } else {
                console.log('DEBUG getPullRequestTitle response:', body);

                reject(new Error('Unable to retrieve the pull request title'));
              }

              req.abort();
            }
          } catch (err) {
            reject(err);
            req.abort();
          }
        });
        response.on('error', function(err) {
          grunt.log.writeln(
            'Failed during pull request title download: ' +
            err
          );
          reject(err);
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

      var config = path.join(__dirname, '..', '.conventional-changelog-lintrc');
      var checkLintConfig = Promise.all([
        fs.stat(config), fs.access(config, fs.R_OK),
      ])
        .then(function(results) {
          const configStat = results[0];

          if (!configStat.isFile()) {
            throw new Error(
              `Config file "${config}" found, but it should be a regular file`
            );
          }
        })
        .catch(function(err) {
          throw new Error(`Unable to load changelog lint config: ${err.stack}`);
        });

      Promise.all([
        checkLintConfig,
        getPreset('angular'),
        getConfiguration(),
      ]).then(function(results) {
        var preset = results[1];
        var configuration = results[2];

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

              return getPullRequestTitle().then(lintMessage);
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

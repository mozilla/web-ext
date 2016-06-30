/*eslint prefer-template: 0*/
var path = require('path');
var spawn = require('child_process').spawn;

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
    'webpack:test',
  ]);

  grunt.registerTask('test', [
    'build-tests',
    'mochaTest',
    'lint',
    'flowbin:check',
    'check-for-smoke',
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
        'newer:eslint',
      ]);
    }
  });

  grunt.registerTask(
    'check-for-smoke',
    'checks to see if web-ext is completely broken', function() {
      grunt.log.writeln('making sure web-ext is not catastrophically broken');

      var done = this.async();
      var webExt = path.join(path.resolve(__dirname), 'bin', 'web-ext');
      var result = spawn(webExt, ['--help']);

      result.stderr.on('data', function(data) {
        grunt.log.writeln(data);
      });

      result.on('close', function(code) {
        grunt.log.writeln('web-ext exited: ' + code);
        var succeeded = code === 0;
        done(succeeded);
      });
    });

  grunt.registerTask(
    'changelog', 'Create a changelog from commits', function(tag) {
      // See https://github.com/mozilla/web-ext/blob/master/CONTRIBUTING.md#writing-commit-messages
      var done = this.async();
      var results = {};

      if (tag === undefined) {
        grunt.log.writeln(
          'Missing first agument: the current git release tag ' +
          '(before the next release)');
        return done(false);
      }

      function processLine(line) {
        // First, get the commit hash.
        var metaMatch = /commit:\{([^\}]+)\} (.*)/.exec(line);
        if (!metaMatch) {
          throw new Error('Could not find commit hash in ' + line);
        }
        var commitHash = metaMatch[1];
        line = metaMatch[2]; // strip off the commit hash part.

        // Parse the semantic commit message.
        // e.g. fix(): Fixed some stuff
        var match = /^([a-zA-Z0-9]+)\(?.*\)?: (.*)$/g.exec(line);
        var bucket;
        var message = line;
        if (!match) {
          bucket = results.uncategorized = results.uncategorized || [];
        } else {
          var type = match[1].toLowerCase();
          bucket = results[type] = results[type] || [];
          message = match[2];
        }

        bucket.push({msg: message, commit: commitHash});
      }

      function commitLink(commit) {
        // Create a Markdown link to the commit.
        return '[' + commit + ']' +
          '(https://github.com/mozilla/web-ext/commit/' + commit + ')';
      }

      function bullet(text) {
        // Create a Markdown bullet point.
        return '  * ' + text;
      }

      function writeChangelog() {
        [
          ['New features:', 'feat'],
          ['Fixes:', 'fix'],
          ['Performance enhancements:', 'perf'],
          ['Uncategorized:', 'uncategorized'],
        ].forEach(function(conf) {
          var header = conf[0];
          var key = conf[1];

          if ((results[key] || []).length) {
            grunt.log.writeln(header);
            results[key].forEach(function(data) {
              grunt.log.writeln(
                bullet(data.msg + ' (' + commitLink(data.commit) + ')'));
            });
            grunt.log.writeln('');
          }
        });
        grunt.log.writeln('General maintenance:');
        grunt.log.writeln(bullet(
          results.chore.length + ' dependency updates (or other chores)'));
        grunt.log.writeln(bullet(
          results.docs.length + ' documentation updates'));
      }

      var git = spawn(
        'git',
        ['log', '--no-merges', '--format=commit:{%h} %s', tag + '...master']);

      git.stderr.on('data', function(data) {
        grunt.log.writeln(data);
        done(false);
      });

      git.stdout.on('data', function(data) {
        data.toString().split('\n').forEach(function(line) {
          if (line !== '') {
            processLine(line);
          }
        });
      });

      git.on('close', function(code) {
        if (code !== 0) {
          grunt.log.writeln('git exited: ' + code);
          done(false);
        } else {
          writeChangelog();
          done(true);
        }
      });

    });

};

// jscs:disable requireTemplateStrings
var fs = require('fs');
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
        'newer:jscs',
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

  grunt.registerTask('publish-coverage',
                     'publish code coverage to coveralls',
                     function() {
    var done = this.async();
    var root = path.join(path.resolve(__dirname));

    var coveralls = spawn(
      path.join(root, 'node_modules', '.bin', 'coveralls'));

    coveralls.stderr.on('data', function(data) {
      grunt.log.writeln('coveralls stderr:');
      grunt.log.writeln(data);
    });

    coveralls.on('close', function(code) {
      grunt.log.writeln('coveralls exited: ' + code);
      var succeeded = code === 0;
      done(succeeded);
    });

    var lcov = path.join(root, 'coverage', 'lcov.info');
    coveralls.stdin.write(fs.readFileSync(lcov));
    coveralls.stdin.end();
  });

};

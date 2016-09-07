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
    'webpack:test',
  ]);

  grunt.registerTask('test', [
    'lint',
    'flowbin:check',
    'build-tests',
    'mochaTest:unit',
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
        'eslint',
      ]);
    }
  });

  grunt.registerTask(
    'check-for-smoke',
    'checks to see if web-ext is completely broken', function() {
      grunt.log.writeln('making sure web-ext is not catastrophically broken');
      grunt.task.run([
        'webpack:smoke',
        'mochaTest:smoke',
      ]);
    });
};

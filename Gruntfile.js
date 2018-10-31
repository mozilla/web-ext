/*eslint prefer-template: 0*/
module.exports = function(grunt) {

  // Looking for something?
  // The source of a grunt task or its configuration might be in:
  // 1. this file :)
  // 2. ./node_modules/grunt-*<task_name>/
  // 3. ./tasks/<task_name>.js
  // 4. ./tasks/config/<task_name>.js


  // This loads all grunt tasks matching the grunt-*, @*/grunt-* patterns.
  require('load-grunt-tasks')(grunt);

  var configs = require('load-grunt-configs')(grunt, {
    config: {
      src: 'tasks/configs/*.js',
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

  grunt.registerTask('test', 'run linting and the unit test suite', function() {
    var tasks = [
      'lint',
      'flowbin:check',
      'build-tests',
      'mochaTest:unit',
    ];

    if (process.env.TRAVIS_OS_NAME === 'windows') {
      tasks = tasks.filter((t) => t !== 'flowbin:check');
      grunt.log.writeln('flowbin:check task skipped because of $APPVEYOR');
    }

    grunt.task.run(tasks);
  });

  grunt.registerTask('test:functional', 'run functional test suites', [
    'build-tests',
    'mochaTest:functional',
  ]);

  grunt.registerTask('copy-dist-files-to-artifacts-dir', function() {
    const distFile = grunt.file.expand('./dist/**').filter((filename) => {
      return filename.endsWith('web-ext.js');
    });

    if (distFile.length === 0) {
      // By default grunt will exit here, unless the `--force` grunt option has been
      // specified on the command line.
      grunt.fail.warn(
        'Required dist/ file missing. Run the build command first.'
      );
    }

    grunt.task.run('copy:dist-files-to-artifacts-dir');
  });

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

  require('./tasks/travis-pr-title-lint')(grunt);
};

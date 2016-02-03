module.exports = function(grunt) {

  // load all grunt tasks matching the ['grunt-*', '@*/grunt-*'] patterns
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

  grunt.registerTask('test', [
    'clean',
    'webpack:build',
    'lint',
    'webpack:test',
    'mochaTest',
  ]);

};

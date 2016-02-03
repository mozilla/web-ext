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

  grunt.registerTask('watch-build', [
    'clean',
    'webpack:watchBuild',
  ]);

  grunt.registerTask('lint', [
    'newer:eslint',
    'newer:jscs',
  ]);

  grunt.registerTask('test', [
    'clean',
    'webpack:build',
    'webpack:test',
    'mochaTest',
    'lint',
  ]);

};

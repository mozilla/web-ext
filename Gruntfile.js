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
    'webpack:build',
  ]);

  grunt.registerTask('watch-build', [
    'webpack:watchBuild',
  ]);

  grunt.registerTask('lint', [
    'newer:eslint',
    'newer:jscs',
  ]);

  grunt.registerTask('test', [
    'webpack:build',
    'mochaTest',
    'lint',
  ]);

};

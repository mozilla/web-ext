// jscs:disable requireTemplateStrings
var crypto = require('crypto');
var fs = require('fs');

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
    'flow:check',
    'check-flow-config',
  ]);

  grunt.registerTask('develop', [
    'flow:server:start',
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

  var flowConfigFile = './.flowconfig';

  grunt.registerTask('check-flow-config', function() {
    var done = this.async();

    inspectPackage(function(error, pkg) {
      if (error) {
        return done(error);
      }

      splitFlowConfig(flowConfigFile, function(error, flowConfig) {
        if (error) {
          return done(error);
        }

        if (flowConfig.autoGenerationKey !== makeAutoGenerationKey(pkg)) {
          grunt.log.writeln('Ignore rules were generated with:');
          grunt.log.writeln(prepareAutoGenerationKey(pkg).toString());
          grunt.log.error(
            'The ignored entries in .flowconfig are out of sync with ' +
            'package.json. Run grunt fix-flow-config to freshen it up.');
          done(false);
        } else {
          grunt.log.writeln('.flowconfig is in sync with package.json');
          done();
        }
      });
    });
  });

  grunt.registerTask('fix-flow-config', function() {
    var done = this.async();

    inspectPackage(function(error, pkg) {
      if (error) {
        return done(error);
      }

      splitFlowConfig(flowConfigFile, function(error, flowConfig) {
        if (error) {
          return done(error);
        }

        var newFlowConfig =
          flowConfig.intro.join('\n') + '\n' +
          '# ' + makeAutoGenerationKey(pkg) + '\n' +
          pkg.unimportedDeps.map(function(dep) {
            return '.*/node_modules/' + dep + '.*';
          }).join('\n') + '\n' +
          flowConfig.outro.join('\n');

        fs.writeFile(flowConfigFile, newFlowConfig, function(error) {
          if (error) {
            return done(error);
          } else {
            grunt.log.writeln('Ignoring all dev dependencies in ' +
                              flowConfigFile);
            return done();
          }
        });
      });
    });
  });

};


function inspectPackage(callback) {
  //
  // Return info about package.json
  //
  // This finds "unimported" dependencies which really means it finds
  // all modules that exist in node_modules that are not declared in
  // package.js as a production dependency.
  //
  fs.readFile('./package.json', function(error, packageFile) {
    if (error) {
      return callback(error);
    }
    var packageData = JSON.parse(packageFile);
    var importedDeps = Object.keys(packageData.dependencies);
    var unimportedDeps = fs.readdirSync('./node_modules')
      .filter(function(dep) {
        return importedDeps.indexOf(dep) < 0;
      });

    callback(null, {
      dependencies: packageData.dependencies,
      devDependencies: packageData.devDependencies,
      unimportedDeps: unimportedDeps,
    });
  });
}


function splitFlowConfig(flowConfigFile, callback) {
  //
  // Split a .flowconfig into useful parts.
  //
  fs.readFile(flowConfigFile, function(error, flowFile) {
    if (error) {
      return callback(error);
    }

    var intro = [];
    var outro = [];
    var ignoredDeps = [];
    var buffer = intro;

    flowFile.toString().split('\n').forEach(function(line) {
      buffer.push(line);
      if (line.lastIndexOf('# DO NOT EDIT: ignored-dependencies', 0) === 0) {
        buffer = ignoredDeps;
      } else if (line.lastIndexOf('# ignored-dependencies: END', 0) === 0) {
        buffer = outro;
        buffer.push(line);
      }
    });

    var autoGenerationKey = null;
    // The first line is special. It stores a key of input used for
    // auto-generation.
    if (ignoredDeps.length) {
      // Strip off the `# ` prefix off the line.
      autoGenerationKey = ignoredDeps[0].substring(2);
    }

    callback(null, {
      intro: intro,
      outro: outro,
      autoGenerationKey: autoGenerationKey,
    });
  });
}


function makeAutoGenerationKey(pkg) {
  //
  // Generate a unique key for the input used in auto-generating
  // .flowconfig ignore rules
  //
  // TODO: Account for differing versions of npm since node_module
  // flattening introduces more flow lag.
  //
  var hash = crypto.createHash('sha256');
  prepareAutoGenerationKey(pkg).forEach(function(part) {
    hash.update(part);
  });
  return hash.digest('hex');
}


function prepareAutoGenerationKey(pkg) {
  return [
    JSON.stringify(Object.keys(pkg.dependencies).sort(), null, 2),
    JSON.stringify(Object.keys(pkg.devDependencies).sort(), null, 2),
  ];
}

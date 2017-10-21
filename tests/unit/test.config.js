/* @flow */
import path from 'path';

import {assert} from 'chai';
import {describe, it} from 'mocha';
import sinon from 'sinon';
import {fs} from 'mz';

import {Program} from '../../src/program';
import {
  applyConfigToArgv,
  loadJSConfigFile,
} from '../../src/config';
import {withTempDir} from '../../src/util/temp-dir';
import {UsageError} from '../../src/errors';

type MakeArgvParams = {|
  userCmd?: Array<string>,
  command?: string,
  commandDesc?: string,
  commandExecutor?: Function,
  commandOpt?: Object,
  globalOpt?: Object,
|}

function makeArgv({
  userCmd = ['fakecommand'],
  command = 'fakecommand',
  commandDesc = 'this is a fake command',
  commandExecutor = sinon.stub(),
  commandOpt,
  globalOpt,
}: MakeArgvParams) {
  const program = new Program(userCmd);

  if (globalOpt) {
    program.setGlobalOptions(globalOpt);
  }
  if (commandOpt) {
    program.command(command, commandDesc, commandExecutor, commandOpt);
  }
  return {
    argv: program.yargs.exitProcess(false).argv,
    options: program.options,
  };
}

const applyConf = (params) => applyConfigToArgv({
  configFileName: 'some/path/to/config.js',
  ...params,
});

describe('config', () => {
  describe('applyConfigToArgv', () => {

    it('preserves a string value on the command line over configured', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';

      const params = makeArgv({
        userCmd: ['fakecommand', '--source-dir', cmdLineSrcDir],
        globalOpt: {
          'source-dir': {
            requiresArg: true,
            type: 'string',
            demand: false,
          },
        },
      });
      const configObject = {
        sourceDir: '/configured/source/dir',
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('preserves configured value over default', () => {
      const params = makeArgv({
        globalOpt: {
          'source-dir': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'default/value/option/definition',
          },
        },
      });
      const configObject = {
        sourceDir: '/configured/source/dir',
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.sourceDir, configObject.sourceDir);
    });

    it('preserves a string value on the command line over all others', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';
      const params = makeArgv({
        userCmd: ['fakecommand', '--sourceDir', cmdLineSrcDir],
        globalOpt: {
          'source-dir': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'default/value/option/definition',
          },
        },
      });
      const configObject = {
        sourceDir: '/configured/source/dir',
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('preserves default value of option if not in config', () => {
      const params = makeArgv({
        globalOpt: {
          'source-dir': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'default/value/option/definition',
          },
          'artifacts-dir': {
            type: 'string',
            demand: false,
          },
        },
      });
      const configObject = {
        artifactsDir: '/configured/artifacts/dir',
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.sourceDir, 'default/value/option/definition');
    });

    it('preserves value on the command line if not in config', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';
      const params = makeArgv({
        userCmd: ['fakecommand', '--sourceDir', cmdLineSrcDir],
        globalOpt: {
          'source-dir': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'default/value/option/definition',
          },
          'artifacts-dir': {
            type: 'string',
            demand: false,
          },
        },
      });
      const configObject = {
        artifactsDir: '/configured/artifacts/dir',
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('uses a configured boolean value over an implicit default', () => {
      const params = makeArgv({
        globalOpt: {
          'overwrite-files': {
            type: 'boolean',
            // No default is set here explicitly but yargs will set it to
            // false implicitly.
          },
        },
      });
      const configObject = {
        overwriteFiles: true,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.overwriteFiles, true);
    });

    it('uses a configured boolean value over explicit falsey default', () => {
      const params = makeArgv({
        globalOpt: {
          'overwrite-files': {
            type: 'boolean',
            default: false,
          },
        },
      });
      const configObject = {
        overwriteFiles: true,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.overwriteFiles, true);
    });

    it('uses configured boolean value over explicit truthy default', () => {
      const params = makeArgv({
        globalOpt: {
          verbose: {
            type: 'boolean',
            default: true,
          },
        },
      });
      const configObject = {
        verbose: false,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.verbose, false);
    });

    it('uses a CLI boolean value over a configured one', () => {
      const params = makeArgv({
        userCmd: ['fakecommand', '--overwrite-files'],
        globalOpt: {
          'overwrite-files': {
            type: 'boolean',
          },
        },
      });
      const configObject = {
        overwriteFiles: false,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.overwriteFiles, true);
    });

    it('uses CLI option over undefined configured option and default', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';
      const params = makeArgv({
        userCmd: ['fakecommand', '--source-dir', cmdLineSrcDir],
        globalOpt: {
          'source-dir': {
            type: 'string',
          },
          'verbose': {
            type: 'boolean',
          },
        },
      });
      const configObject = {
        verbose: true,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('uses a configured number value over a falsey default', () => {
      const params = makeArgv({
        userCmd: ['fakecommand'],
        globalOpt: {
          'number-of-retries': {
            type: 'number',
            default: 0,
          },
        },
      });
      const configObject = {
        numberOfRetries: 1,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.numberOfRetries, 1);
    });

    it('uses a falsey CLI number value over a configured one', () => {
      const params = makeArgv({
        userCmd: ['fakecommand', '--number-of-retries=0'],
        globalOpt: {
          'number-of-retries': {
            type: 'number',
            default: 1,
          },
        },
      });
      const configObject = {
        numberOfRetries: 1,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.numberOfRetries, 0);
    });

    it('uses configured value even when option defaults to undefined', () => {
      const params = makeArgv({
        globalOpt: {
          'source-dir': {
            type: 'string',
            default: undefined,
          },
        },
      });
      const configObject = {
        sourceDir: '/configured/directory',
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.sourceDir, '/configured/directory');
    });

    it('throws an error when an option is not camel cased', () => {
      const params = makeArgv({
        globalOpt: {
          'source-dir': {
            type: 'string',
            demand: false,
          },
        },
      });
      const configObject = {
        'source-dir': 'fake/value/',
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError, 'UsageError: The config option "source-dir" must be ' +
        'specified in camel case: "sourceDir"');
    });

    it('throws an error when an option is invalid', () => {
      const params = makeArgv({
        globalOpt: {
          'source-dir': {
            type: 'string',
            demand: false,
          },
        },
      });
      const configObject = {
        randomDir: 'fake/artifacts/dir',
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError, 'UsageError: The config file ' +
      'at some/path/to/config.js specified an unknown option: "randomDir"');
    });

    it('throws an error when a global option type is invalid', () => {
      const params = makeArgv({
        globalOpt: {
          retries: {
            type: 'number',
            default: 1,
          },
        },
      });
      const configObject = {
        retries: 'invalid-value',
      };
      assert.throws(
        () => applyConf({...params, configObject}),
        UsageError,
        'UsageError: The config file at some/path/to/config.js specified the ' +
        'type of "retries" incorrectly as "string" (expected type: "number")'
      );
    });

    it('throws an error when the type of option value is invalid', () => {
      const params = makeArgv({
        globalOpt: {
          'source-dir': {
            type: 'string',
            demand: false,
          },
        },
      });
      const configObject = {
        sourceDir: {randomKey: 'randomValue'},
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError, 'UsageError: The config file at some/path/to/config.js ' +
        'specified the type of "sourceDir" incorrectly');
    });

    it('does not throw an error when the type of option value is count', () => {
      const params = makeArgv({
        globalOpt: {
          'random-numeric-option': {
            type: 'count',
            default: 0,
          },
        },
      });
      const configObject = {
        randomNumericOption: 15,
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.randomNumericOption, 15);
    });
  });

  describe('sub commands', () => {
    it('preserves configured value over default', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-key': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value',
          },
        },
      });
      const configObject = {
        sign: {
          apiKey: 'custom-configured-key',
        },
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.apiKey, configObject.sign.apiKey);
    });

    it('preserves CLI value over default and configured', () => {
      const cmdApiKey = 'api-key-cmd';
      const params = makeArgv({
        userCmd: ['sign', '--api-key', cmdApiKey],
        command: 'sign',
        commandOpt: {
          'api-key': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value',
          },
        },
      });
      const configObject = {
        sign: {
          apiKey: 'custom-configured-key',
        },
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.apiKey, cmdApiKey);
    });

    it('preserves CLI value over configured', () => {
      const cmdApiKey = 'api-key-cmd';
      const params = makeArgv({
        userCmd: ['sign', '--api-key', cmdApiKey],
        command: 'sign',
        commandOpt: {
          'api-key': {
            requiresArg: true,
            type: 'string',
            demand: false,
          },
        },
      });
      const configObject = {
        sign: {
          apiKey: 'custom-configured-key',
        },
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.apiKey, cmdApiKey);
    });

    it('preserves default value if not in config', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-key': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
          'api-url': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiUrl',
          },
        },
      });
      const configObject = {
        sign: {
          apiKey: 'custom-configured-key',
        },
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.apiUrl, 'pretend-default-value-of-apiUrl');
    });

    it('preserves CLI value if not in config', () => {
      const cmdApiKey = 'api-key-cmd';
      const params = makeArgv({
        userCmd: ['sign', '--api-key', cmdApiKey],
        command: 'sign',
        commandOpt: {
          'api-key': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
          'api-url': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiUrl',
          },
        },
      });
      const configObject = {
        sign: {
          apiUrl: 'custom-configured-url',
        },
      };
      const newArgv = applyConf({...params, configObject});
      assert.strictEqual(newArgv.apiKey, cmdApiKey);
    });

    it('handles camel case sub-commands', () => {
      const params = makeArgv({
        userCmd: ['sign-extension'],
        command: 'sign-extension',
        commandOpt: {
          'api-url': {
            requiresArg: true,
            type: 'string',
            default: 'pretend-default-value-of-apiKey',
          },
        },
      });
      const configObject = {
        signExtension: {
          apiUrl: 2,
        },
      };
      assert.throws(
        () => applyConf({...params, configObject}),
        UsageError,
        'UsageError: The config file at some/path/to/config.js ' +
        'specified the type of "apiUrl" incorrectly'
      );
    });

    it('throws an error when the option is not camel cased', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-url': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
        },
      });
      const configObject = {
        sign: {
          'api-url': 2,
        },
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError, 'UsageError: The config option "api-url"' +
        ' must be specified in camel case: "apiUrl"');
    });

    it('throws an error when the option is invalid', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-url': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
        },
      });
      const configObject = {
        sign: {
          randomOption: 'random-value',
        },
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError, 'UsageError: The config file at ' +
      'some/path/to/config.js specified an unknown option: "randomOption"');
    });

    it('throws an error when the type of option value is invalid', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-url': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
        },
      });
      const configObject = {
        sign: {
          apiUrl: 2,
        },
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError, 'UsageError: The config file at some/path/to/config.js ' +
        'specified the type of "apiUrl" incorrectly');
    });

    it('throws an error when the type of one of option values' +
      ' is invalid', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-url': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
          'api-key': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
        },
      });
      const configObject = {
        sign: {
          apiUrl: 2,
          apiKey: 'fake-api-key',
        },
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError, 'UsageError: The config file at some/path/to/config.js ' +
        'specified the type of "apiUrl" incorrectly');
    });

    it('throws an error when the type of option is missing', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-url': {
            requiresArg: true,
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
        },
      });
      const configObject = {
        sign: {
          apiUrl: 2,
          apiKey: 'fake-api-key',
        },
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError,
        'UsageError: Option: apiUrl was defined without a type.');
    });

    it('throws an error when the type of one of them is in config' +
      ' missing', () => {
      const params = makeArgv({
        userCmd: ['sign'],
        command: 'sign',
        commandOpt: {
          'api-url': {
            requiresArg: true,
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
          'api-key': {
            requiresArg: true,
            demand: false,
            type: 'string',
            default: 'pretend-default-value-of-apiKey',
          },
        },
      });
      const configObject = {
        sign: {
          apiUrl: 2,
          apiKey: 'fake-api-key',
        },
      };
      assert.throws(() => {
        applyConf({...params, configObject});
      }, UsageError,
        'UsageError: Option: apiUrl was defined without a type.');
    });

    it('throws an error when type of unrelated sub option is invalid', () => {
      const program = new Program(['run']);

      program.command('run', 'this is a fake command', sinon.stub(),
        {
          'no-reload': {
            type: 'boolean',
            demand: false,
          },
        });

      program.command('sign', 'this is a fake command',
        sinon.stub(), {
          'api-url': {
            requiresArg: true,
            type: 'string',
            demand: false,
            default: 'pretend-default-value-of-apiKey',
          },
        });

      const configObject = {
        sign: {
          apiUrl: 2,
        },
      };

      assert.throws(() => {
        applyConf({
          argv: program.yargs.exitProcess(false).argv,
          options: program.options,
          configObject});
      }, UsageError, 'UsageError: The config file at some/path/to/config.js ' +
        'specified the type of "apiUrl" incorrectly as "number"' +
        ' (expected type: "string")');
    });

  });

  describe('loadJSConfigFile', () => {
    it('throws an error if the config file does not exist', () => {
      return withTempDir (
        (tmpDir) => {
          assert.throws(() => {
            loadJSConfigFile((path.join(tmpDir.path(),
              'non-existant-config.js')));
          }, UsageError, /Cannot read config file/);
        });
    });

    it('throws an error if the config file has syntax errors', () => {
      return withTempDir (
        (tmpDir) => {
          const configFilePath = path.join(tmpDir.path(), 'config.js');
          fs.writeFileSync(configFilePath,
            // missing = in two places
            `module.exports {
                sourceDir 'path/to/fake/source/dir',
              };`);
          assert.throws(() => {
            loadJSConfigFile(configFilePath);
          }, UsageError);
        });
    });

    it('parses the configuration file correctly', () => {
      return withTempDir(
        (tmpDir) => {
          const configFilePath = path.join(tmpDir.path(), 'config.js');
          fs.writeFileSync(configFilePath,
            `module.exports = {
              sourceDir: 'path/to/fake/source/dir',
            };`);
          const configObj = loadJSConfigFile(configFilePath);
          assert.equal(configObj.sourceDir, 'path/to/fake/source/dir');
        });
    });

    it('does not throw an error for an empty config', () => {
      return withTempDir(
        (tmpDir) => {
          const configFilePath = path.join(tmpDir.path(), 'config.js');
          fs.writeFileSync(configFilePath, '{};');
          loadJSConfigFile(configFilePath);
        });
    });
  });
});

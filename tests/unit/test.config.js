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
    defaultValues: program.defaultValues,
    commandExecuted: command,
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

      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('preserves configured value over default', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, configObject.sourceDir);
    });

    it('preserves a string value on the command line over all others', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('preserves default value of option if not in config', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, 'default/value/option/definition');
    });

    it('preserves value on the command line if not in config', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('uses a configured boolean value over an implicit default', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.overwriteFiles, true);
    });

    it('uses a configured boolean value over an explicit default', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.overwriteFiles, true);
    });

    it('uses a CLI boolean value over a configured one', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.overwriteFiles, true);
    });

    it('uses CLI option over undefined configured option and default', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('uses a configured number value over a falsey default', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.numberOfRetries, 1);
    });

    it('uses a falsey CLI number value over a configured one', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.numberOfRetries, 0);
    });

    it('uses configured value even when option defaults to undefined', () => {
      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConf({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, '/configured/directory');
    });

    it('throws an error when an option is not camel cased', () => {
      const {argv, defaultValues} = makeArgv({
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
        applyConf({argv, configObject, defaultValues});
      }, UsageError, 'UsageError: The config option "source-dir" must be ' +
        'specified in camel case: "sourceDir"');
    });

    it('throws an error when an option is invalid', () => {
      const {argv, defaultValues} = makeArgv({
        globalOpt: {
          'source-dir': {
            type: 'string',
            demand: false,
          },
        },
      });
      const configFileName = 'fake/path/to/config';
      const configObject = {
        artifactsDir: 'fake/artifacts/dir',
      };
      assert.throws(() => {
        applyConf({argv, configObject, defaultValues, configFileName});
      }, UsageError, 'UsageError: The config file at fake/path/to/config ' +
        'specified an unknown option: "artifactsDir"');
    });
  });

  describe('sub commands', () => {
    it('preserves configured value over default', () => {
      const {argv, defaultValues, commandExecuted} = makeArgv({
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
      const newArgv = applyConf({
        argv,
        configObject,
        defaultValues,
        commandExecuted,
      });
      assert.strictEqual(newArgv.apiKey, configObject.sign.apiKey);
    });

    it('preserves CLI value over default and configured', () => {
      const cmdApiKey = 'api-key-cmd';
      const {argv, defaultValues, commandExecuted} = makeArgv({
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
      const newArgv = applyConf({
        argv,
        configObject,
        defaultValues,
        commandExecuted,
      });
      assert.strictEqual(newArgv.apiKey, cmdApiKey);
    });

    it('preserves CLI value over configured', () => {
      const cmdApiKey = 'api-key-cmd';
      const {argv, defaultValues, commandExecuted} = makeArgv({
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
      const newArgv = applyConf({
        argv,
        configObject,
        defaultValues,
        commandExecuted,
      });
      assert.strictEqual(newArgv.apiKey, cmdApiKey);
    });

    it('preserves default value if not in config', () => {
      const {argv, defaultValues, commandExecuted} = makeArgv({
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
      const newArgv = applyConf({
        argv,
        configObject,
        defaultValues,
        commandExecuted,
      });
      assert.strictEqual(newArgv.apiUrl, 'pretend-default-value-of-apiUrl');
    });

    it('preserves CLI value if not in config', () => {
      const cmdApiKey = 'api-key-cmd';
      const {argv, defaultValues, commandExecuted} = makeArgv({
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
      const newArgv = applyConf({
        argv,
        configObject,
        defaultValues,
        commandExecuted,
      });
      assert.strictEqual(newArgv.apiKey, cmdApiKey);
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

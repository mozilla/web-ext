import path from 'path';

import {assert} from 'chai';
import {describe, it} from 'mocha';
import sinon from 'sinon';
import {fs} from 'mz';

import {Program} from '../../src/program';
import {
  applyConfigToArgv,
  parseConfig,
  loadJSConfigFile,
} from '../../src/config';
import {withTempDir} from '../../src/util/temp-dir';
import {UsageError} from '../../src/errors';

function makeArgv({
  userCmd = [],
  command = 'fakecommand',
  commandDesc = 'this is a fake command',
  commandExecutor = sinon.stub(),
  commandOpt,
  globalOpt,
}) {
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
  };
}

describe('config', () => {
  describe('applyConfigToArgv', () => {
    it('overrides the default value with a configured value', () => {

      const {argv, defaultValues} = makeArgv({
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
      const newArgv = applyConfigToArgv({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, configObject.sourceDir);
    });

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
      const newArgv = applyConfigToArgv({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });

    it('preserves configured value over default', () => {
      const {argv, defaultValues} = makeArgv({
        userCmd: ['fakecommand'],
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
      const newArgv = applyConfigToArgv({argv, configObject, defaultValues});
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
      const newArgv = applyConfigToArgv({argv, configObject, defaultValues});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });
  });

  describe('loadJSConfigFile', () => {
    it('throws an error if the config file does not exist', () => {
      return withTempDir (
        (tmpDir) => {
          assert.throws(() => {
            loadJSConfigFile(tmpDir.path());
          }, UsageError, /Cannot read config file/);
        });
    });
  });

  describe('parseConfig', () => {
    it('parses the configuration file correctly', () => {
      return withTempDir(
        (tmpDir) => {
          const configFilePath = path.join(tmpDir.path(), 'config.js');
          const configFileName = 'config.js';
          fs.writeFileSync(configFilePath,
          `module.exports = {
            sourceDir: 'path/to/fake/source/dir',
          };`);
          const sourceDir = tmpDir.path();
          const configObj = parseConfig({sourceDir, configFileName});
          assert.equal(configObj.sourceDir, 'path/to/fake/source/dir');
        });
    });
  });
});

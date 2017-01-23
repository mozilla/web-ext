import {assert} from 'chai';
import {describe, it} from 'mocha';
import sinon from 'sinon';

//import {fake} from './helpers';
import {Program} from '../../src/program';
import {applyConfigToArgv} from '../../src/config';

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

  return program.yargs.exitProcess(false).argv;
}

describe('config', () => {
  describe('applyConfigToArgv', () => {
    it('overrides the default value with a configured value', () => {

      const argv = makeArgv({
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
      const newArgv = applyConfigToArgv({argv, configObject});
      assert.strictEqual(newArgv.sourceDir, configObject.sourceDir);
    });

    it('preserves a string option value on the command line', () => {
      const cmdLineSrcDir = '/user/specified/source/dir/';

      const argv = makeArgv({
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
      const newArgv = applyConfigToArgv({argv, configObject});
      assert.strictEqual(newArgv.sourceDir, cmdLineSrcDir);
    });
  });
});

/* @flow */
import {describe, it} from 'mocha';
import path from 'path';
import {fs} from 'mz';
import sinon from 'sinon';
import {assert} from 'chai';
import {spy} from 'sinon';

import {defaultVersionGetter, main, Program} from '../../src/program';
import commands from '../../src/cmd';
import {onlyInstancesOf, UsageError} from '../../src/errors';
import {fake, makeSureItFails} from './helpers';
import {ConsoleStream} from '../../src/util/logger';

import git from 'git-rev-sync';


describe('program.Program', () => {

  function execProgram(program, options = {}) {
    let fakeProcess = fake(process);
    let absolutePackageDir = path.join(__dirname, '..', '..');
    return program.execute(
      absolutePackageDir, {
        systemProcess: fakeProcess,
        shouldExitProgram: false,
        ...options,
      });
  }

  it('executes a command callback', () => {
    let thing = spy(() => Promise.resolve());
    let program = new Program(['thing'])
      .command('thing', 'does a thing', thing);
    return execProgram(program)
      .then(() => {
        assert.equal(thing.called, true);
      });
  });

  it('reports unknown commands', () => {
    let program = new Program(['thing']);
    return execProgram(program)
      .then(makeSureItFails())
      .catch(onlyInstancesOf(UsageError, (error) => {
        assert.match(error.message, /Unknown command: thing/);
      }));
  });

  it('reports missing command', () => {
    let program = new Program([]);
    return execProgram(program)
      .then(makeSureItFails())
      .catch(onlyInstancesOf(UsageError, (error) => {
        assert.match(error.message, /No sub-command was specified/);
      }));
  });

  it('exits 1 on a thrown error', () => {
    let fakeProcess = fake(process);
    let program = new Program(['cmd'])
      .command('cmd', 'some command', () => {
        throw new Error('this is an error from a command handler');
      });
    return execProgram(program, {
      systemProcess: fakeProcess,
      shouldExitProgram: true,
    })
      .then(() => {
        assert.equal(fakeProcess.exit.called, true);
        assert.equal(fakeProcess.exit.firstCall.args[0], 1);
      });
  });

  it('throws an error if sub-command is given an argument', () => {
    const program = new Program(['thing', 'nope'])
      .command('thing', '', () => {});
    return execProgram(program)
      .then(makeSureItFails())
      .catch((error) => {
        assert.match(error.message, /This command does not take any arguments/);
      });
  });

  it('handles errors that have codes', () => {

    class ErrorWithCode extends Error {
      code: string;
      constructor() {
        super('pretend this is a system error');
        this.code = 'SOME_CODE';
      }
    }

    let program = new Program(['cmd'])
      .command('cmd', 'some command', () => {
        let error = new ErrorWithCode();
        throw error;
      });
    // This is just a smoke test to make sure the error code doesn't
    // introduce an unexpected exception.
    return execProgram(program)
      .then(makeSureItFails())
      .catch((error) => {
        assert.match(error.message, /pretend this is a system error/);
      });
  });

  it('lets commands define options', () => {
    let handler = spy(() => Promise.resolve());
    let program = new Program(['cmd'])
      .command('cmd', 'some command', handler, {
        'some-option': {
          default: 'default value',
        },
      });
    return execProgram(program)
      .then(() => {
        assert.equal(handler.called, true);
        // This ensures that the default configuration for the option has
        // been applied.
        assert.equal(handler.firstCall.args[0].someOption, 'default value');
      });
  });

  it('preserves global option configuration', () => {
    let handler = spy(() => Promise.resolve());
    let program = new Program(['cmd'])
      .setGlobalOptions({
        'global-option': {
          type: 'string',
          default: 'the default',
        },
      })
      .command('cmd', 'some command', handler, {
        'some-option': {
          default: 'default value',
        },
      });
    return execProgram(program)
      .then(() => {
        assert.equal(handler.called, true);
        // By checking the global default, it ensures that default configuration
        // will be applied to sub commands.
        assert.equal(handler.firstCall.args[0].globalOption, 'the default');
        assert.equal(handler.firstCall.args[0].someOption, 'default value');
      });
  });

  it('reads option values from env vars in sub commands', () => {
    // Set an env var that mimics web-ext cmd --some-opt=value
    process.env.WEB_EXT_SOME_OPT = 'value';
    let valueReceived;
    const program = new Program(['cmd'])
      .command('cmd', 'some command', ({someOpt}) => {
        valueReceived = someOpt;
      }, {
        'some-opt': {
          describe: 'example option',
        },
      });
    return execProgram(program, {shouldExitProgram: true})
      .then(() => {
        assert.equal(valueReceived, 'value');
        delete process.env.WEB_EXT_SOME_OPT;
      });
  });

  it('configures the logger when verbose', () => {
    const logStream = fake(new ConsoleStream());

    let program = new Program(['--verbose', 'thing']);
    program.setGlobalOptions({
      verbose: {
        type: 'boolean',
      },
    });
    program.command('thing', 'does a thing', () => {});

    return execProgram(program, {getVersion: spy(), logStream})
      .then(() => {
        assert.equal(logStream.makeVerbose.called, true);
      });
  });

  it('checks the version when verbose', () => {
    let version = spy();
    let program = new Program(['--verbose', 'thing']);
    program.setGlobalOptions({
      verbose: {
        type: 'boolean',
      },
    });
    program.command('thing', 'does a thing', () => {});
    return execProgram(program, {getVersion: version})
      .then(() => {
        assert.equal(version.firstCall.args[0],
                     path.join(__dirname, '..', '..'));
      });
  });

  it('does not configure the logger unless verbose', () => {
    const logStream = fake(new ConsoleStream());
    let program = new Program(['thing']).command('thing', '', () => {});
    program.setGlobalOptions({
      verbose: {
        type: 'boolean',
      },
    });
    return execProgram(program, {logStream})
      .then(() => {
        assert.equal(logStream.makeVerbose.called, false);
      });
  });

  it('throws an error about unknown commands', () => {
    return execProgram(new Program(['nope']))
      .then(makeSureItFails())
      .catch((error) => {
        assert.match(error.message, /Unknown command: nope/);
      });
  });

  it('throws an error about unknown options', () => {
    return execProgram(new Program(['--nope']))
      .then(makeSureItFails())
      .catch((error) => {
        // It's a bit weird that yargs calls this an argument rather
        // than an option but, hey, it's an error.
        assert.match(error.message, /Unknown argument: nope/);
      });
  });

  it('throws an error about unknown sub-command options', () => {
    const program = new Program(['thing', '--nope'])
      .command('thing', '', () => {});
    return execProgram(program)
      .then(makeSureItFails())
      .catch((error) => {
        // Again, yargs calls this an argument not an option for some reason.
        assert.match(error.message, /Unknown argument: nope/);
      });
  });

});


describe('program.main', () => {

  function execProgram(argv, {projectRoot = '', ...mainOptions}: Object = {}) {
    const runOptions = {shouldExitProgram: false, systemProcess: fake(process)};
    return main(projectRoot, {argv, runOptions, ...mainOptions});
  }

  it('executes a command handler', () => {
    let fakeCommands = fake(commands, {
      build: () => Promise.resolve(),
    });
    return execProgram(['build'], {commands: fakeCommands})
      .then(() => {
        // This is a smoke test mainly to make sure main() configures
        // options with handlers. It does not extensively test the
        // configuration of all handlers.
        assert.equal(fakeCommands.build.called, true);
      });
  });

  it('can get the program version', () => {
    const fakeVersionGetter = sinon.spy(() => '<version>');
    const fakeCommands = fake(commands, {
      build: () => Promise.resolve(),
    });
    const projectRoot = '/pretend/project/root';
    // For some reason, executing --version like this
    // requires a command. In the real CLI, it does not.
    return execProgram(['--version', 'build'],
      {
        projectRoot,
        commands: fakeCommands,
        getVersion: fakeVersionGetter,
      })
      .then(() => {
        assert.equal(fakeVersionGetter.called, true);
        assert.equal(fakeVersionGetter.firstCall.args[0], projectRoot);
      });
  });

  it('turns sourceDir into an absolute path', () => {
    const fakeCommands = fake(commands, {
      build: () => Promise.resolve(),
    });
    return execProgram(
      ['build', '--source-dir', '..'], {commands: fakeCommands})
      .then(() => {
        assert.equal(fakeCommands.build.called, true);
        assert.equal(fakeCommands.build.firstCall.args[0].sourceDir,
                     path.resolve(path.join(process.cwd(), '..')));
      });
  });

  it('normalizes the artifactsDir path', () => {
    const fakeCommands = fake(commands, {
      build: () => Promise.resolve(),
    });
    return execProgram(
      // Add a double slash to the path, which will be fixed by normalization.
      ['build', '--artifacts-dir', process.cwd() + path.sep + path.sep],
      {commands: fakeCommands})
      .then(() => {
        assert.equal(fakeCommands.build.called, true);
        assert.equal(fakeCommands.build.firstCall.args[0].artifactsDir,
                     process.cwd() + path.sep);
      });
  });

  it('passes the path of a firefox binary when specified', () => {
    const fakeCommands = fake(commands, {
      run: () => Promise.resolve(),
    });
    return execProgram(
      ['run', '--firefox-binary', '/path/to/firefox-binary'],
      {commands: fakeCommands})
      .then(() => {
        assert.equal(fakeCommands.run.called, true);
        assert.equal(fakeCommands.run.firstCall.args[0].firefox,
                     '/path/to/firefox-binary');
      });
  });

});


describe('program.defaultVersionGetter', () => {
  let root = path.join(__dirname, '..', '..');

  it('returns the package version in production', () => {
    let pkgFile = path.join(root, 'package.json');
    return fs.readFile(pkgFile)
      .then((pkgData) => {
        const testBuildEnv = {localEnv: 'production'};
        assert.equal(defaultVersionGetter(root, testBuildEnv),
                   JSON.parse(pkgData).version);
      });
  });

  it('returns git commit information in development', () => {
    const commit = `${git.branch()}-${git.long()}`;
    const testBuildEnv = {localEnv: 'development'};
    assert.equal(defaultVersionGetter(root, testBuildEnv),
                 commit);
  });

});

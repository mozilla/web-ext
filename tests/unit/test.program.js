/* @flow */
import path from 'path';

import {describe, it} from 'mocha';
import git from 'git-rev-sync';
import {fs} from 'mz';
import sinon, {spy} from 'sinon';
import {assert} from 'chai';

import {defaultVersionGetter, main, Program} from '../../src/program';
import commands from '../../src/cmd';
import {onlyInstancesOf, UsageError} from '../../src/errors';
import {fake, makeSureItFails, ErrorWithCode} from './helpers';
import {ConsoleStream} from '../../src/util/logger';


describe('program.Program', () => {

  function execProgram(program, options = {}) {
    const fakeProcess = fake(process);
    const absolutePackageDir = path.join(__dirname, '..', '..');
    return program.execute(
      absolutePackageDir, {
        getVersion: () => spy(),
        checkForUpdates: spy(),
        systemProcess: fakeProcess,
        shouldExitProgram: false,
        ...options,
      });
  }

  it('executes a command callback', () => {
    const thing = spy(() => Promise.resolve());
    const program = new Program(['thing'])
      .command('thing', 'does a thing', thing);
    return execProgram(program)
      .then(() => {
        assert.equal(thing.called, true);
      });
  });

  it('reports unknown commands', () => {
    const program = new Program(['thing']);
    return execProgram(program)
      .then(makeSureItFails())
      .catch(onlyInstancesOf(UsageError, (error) => {
        assert.match(error.message, /Unknown command: thing/);
      }));
  });

  it('reports missing command', () => {
    const program = new Program([]);
    return execProgram(program)
      .then(makeSureItFails())
      .catch(onlyInstancesOf(UsageError, (error) => {
        assert.match(error.message, /No sub-command was specified/);
      }));
  });

  it('exits 1 on a thrown error', () => {
    const fakeProcess = fake(process);
    const program = new Program(['cmd'])
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

    const program = new Program(['cmd'])
      .command('cmd', 'some command', () => {
        const error = new ErrorWithCode();
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
    const handler = spy(() => Promise.resolve());
    const program = new Program(['cmd'])
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
    const handler = spy(() => Promise.resolve());
    const program = new Program(['cmd'])
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

    const program = new Program(['--verbose', 'thing']);
    program.setGlobalOptions({
      verbose: {
        type: 'boolean',
      },
    });
    program.command('thing', 'does a thing', () => {});

    return execProgram(program, {
      getVersion: spy(),
      logStream,
    })
      .then(() => {
        assert.equal(logStream.makeVerbose.called, true);
      });
  });

  it('checks the version when verbose', () => {
    const version = spy();
    const program = new Program(['--verbose', 'thing']);
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
    const program = new Program(['thing']).command('thing', '', () => {});
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

  it('checks for updates automatically', () => {
    const handler = spy();
    const getVersion = () => 'some-package-version';
    const checkForUpdates = sinon.stub();
    const program = new Program(['run'])
      .command('run', 'some command', handler);
    return execProgram(program, {
      checkForUpdates,
      getVersion,
      globalEnv: 'production',
    })
      .then(() => {
        assert.equal(checkForUpdates.firstCall.args[0].version,
                    'some-package-version');
      });
  });

  it('does not check for updates during development', () => {
    const handler = spy();
    const getVersion = () => 'some-package-version';
    const checkForUpdates = sinon.stub();
    const program = new Program(['run'])
      .command('run', 'some command', handler);
    return execProgram(program, {
      checkForUpdates,
      getVersion,
      globalEnv: 'development',
    })
      .then(() => {
        assert.equal(checkForUpdates.called, false);
      });
  });
});


describe('program.main', () => {

  function execProgram(argv, {projectRoot = '', ...mainOptions}: Object = {}) {
    const runOptions = {
      getVersion: () => 'not-a-real-version',
      checkForUpdates: spy(),
      shouldExitProgram: false,
      systemProcess: fake(process),
    };
    return main(projectRoot, {argv, runOptions, ...mainOptions});
  }

  it('executes a command handler', () => {
    const fakeCommands = fake(commands, {
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

  it('throws an error if no command is given', () => {
    const fakeCommands = fake(commands, {});
    return execProgram([], {commands: fakeCommands})
      .then(makeSureItFails())
      .catch((error) => {
        assert.match(error.message, /You must specify a command/);
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

  it('passes the url of a firefox binary when specified', () => {
    const fakeCommands = fake(commands, {
      run: () => Promise.resolve(),
    });
    return execProgram(
      ['run', '--start-url', 'www.example.com'],
      {commands: fakeCommands})
      .then(() => {
        assert.equal(fakeCommands.run.called, true);
        assert.equal(fakeCommands.run.firstCall.args[0].startUrl,
                     'www.example.com');
      });
  });

  it('opens browser console when --browser-console is specified', () => {
    const fakeCommands = fake(commands, {
      run: () => Promise.resolve(),
    });
    return execProgram(
      ['run', '--browser-console'],
      {commands: fakeCommands})
      .then(() => {
        assert.equal(fakeCommands.run.called, true);
        assert.equal(fakeCommands.run.firstCall.args[0].browserConsole,
                     true);
      });
  });

  it('converts custom preferences into an object', () => {
    const fakeCommands = fake(commands, {
      run: () => Promise.resolve(),
    });
    return execProgram(
      ['run', '--pref', 'prop=true', '--pref', 'prop2=value2'],
      {commands: fakeCommands})
      .then(() => {
        const {customPrefs} = fakeCommands.run.firstCall.args[0];
        assert.isObject(customPrefs);
        assert.equal(customPrefs.prop, true);
        assert.equal(customPrefs.prop2, 'value2');
      });
  });
});

describe('program.defaultVersionGetter', () => {
  const root = path.join(__dirname, '..', '..');

  it('returns the package version in production', () => {
    const pkgFile = path.join(root, 'package.json');
    return fs.readFile(pkgFile)
      .then((pkgData) => {
        const testBuildEnv = {globalEnv: 'production'};
        assert.equal(defaultVersionGetter(root, testBuildEnv),
                   JSON.parse(pkgData).version);
      });
  });

  it('returns git commit information in development', function() {
    if (process.env.APPVEYOR) {
      // Test skipped because of $APPVEYOR' issues with git-rev-sync (mozilla/web-ext#774)
      this.skip();
      return;
    }
    const commit = `${git.branch()}-${git.long()}`;
    const testBuildEnv = {globalEnv: 'development'};
    assert.equal(defaultVersionGetter(root, testBuildEnv),
                 commit);
  });
});

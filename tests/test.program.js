/* @flow */
import {describe, it} from 'mocha';
import path from 'path';
import fs from 'mz/fs';
import {assert} from 'chai';
import {spy} from 'sinon';

import {version, main, Program} from '../src/program';
import commands from '../src/cmd';
import {onlyInstancesOf, WebExtError} from '../src/errors';
import {fake, makeSureItFails} from './helpers';


describe('program.Program', () => {

  function run(program, options={}) {
    let fakeProcess = fake(process);
    return program.run({
      systemProcess: fakeProcess,
      throwError: true,
      ...options,
    });
  }

  it('executes a command callback', () => {
    let thing = spy(() => Promise.resolve());
    let program = new Program(['thing'])
      .command('thing', 'does a thing', thing);
    return run(program)
      .then(() => {
        assert.equal(thing.called, true);
      });
  });

  it('reports unknown commands', () => {
    let program = new Program(['thing']);
    return run(program, {throwError: true})
      .then(makeSureItFails())
      .catch(onlyInstancesOf(WebExtError, (error) => {
        assert.match(error.message, /unknown command: thing/);
      }));
  });

  it('reports missing command', () => {
    let program = new Program([]);
    return run(program)
      .then(makeSureItFails())
      .catch(onlyInstancesOf(WebExtError, (error) => {
        assert.match(error.message, /No sub-command was specified/);
      }));
  });

  it('exits 1 on a thrown error', () => {
    let fakeProcess = fake(process);
    let program = new Program(['cmd'])
      .command('cmd', 'some command', () => {
        throw new Error('this is an error from a command handler');
      });
    return run(program, {systemProcess: fakeProcess, throwError: false})
      .then(() => {
        assert.equal(fakeProcess.exit.called, true);
        assert.equal(fakeProcess.exit.firstCall.args[0], 1);
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
    return run(program)
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
    return run(program)
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
    return run(program)
      .then(() => {
        assert.equal(handler.called, true);
        // By checking the global default, it ensures that default configuration
        // will be applied to sub commands.
        assert.equal(handler.firstCall.args[0].globalOption, 'the default');
        assert.equal(handler.firstCall.args[0].someOption, 'default value');
      });
  });

});


describe('program.main', () => {

  function run(argv, {fakeCommands}) {
    let runOptions = {throwError: true, systemProcess: fake(process)};
    return main('', {commands: fakeCommands, argv, runOptions});
  }

  it('executes a command handler', () => {
    let fakeCommands = fake(commands, {
      build: () => Promise.resolve(),
    });
    return run(['build'], {fakeCommands})
      .then(() => {
        // This is a smoke test mainly to make sure main() configures
        // options with handlers. It does not extensively test the
        // configuration of all handlers.
        assert.equal(fakeCommands.build.called, true);
      });
  });

});


describe('program.version', () => {

  it('returns the package version', () => {
    let root = path.join(__dirname, '..');
    let pkgFile = path.join(root, 'package.json');
    return fs.readFile(pkgFile)
      .then((pkgData) => {
        assert.equal(version(root), JSON.parse(pkgData).version);
      });
  });

});

import {assert} from 'chai';
import {mock, spy} from 'sinon';

import {Program} from '../../src/program';
import {onlyInstancesOf, WebExtError} from '../../src/errors';
import {makeSureItFails} from '../helpers';


describe('program.Program', () => {

  it('executes a command callback', () => {
    let thing = spy(() => new Promise((resolve) => resolve()));
    let program = new Program(['thing'])
      .command('thing', 'does a thing', thing);
    return program.run()
      .then(() => {
        assert.equal(thing.called, true);
      });
  });

  it('reports unknown commands', () => {
    let program = new Program(['thing']);
    return program.run({throwError: true})
      .then(makeSureItFails())
      .catch(onlyInstancesOf(WebExtError, (error) => {
        assert.match(error.message, /unknown command: thing/);
      }));
  });

  it('reports missing command', () => {
    let program = new Program([]);
    return program.run({throwError: true})
      .then(makeSureItFails())
      .catch(onlyInstancesOf(WebExtError, (error) => {
        assert.match(error.message, /No sub-command was specified/);
      }));
  });

  it('exits 1 on a thrown error', () => {
    let systemProcess = {exit: () => {}};
    let mockProcess = mock(systemProcess);
    mockProcess.expects('exit').withArgs(1);

    let program = new Program(['cmd'])
      .command('cmd', 'some command', () => {
        throw new Error('this is an error from a command handler');
      });
    return program.run({systemProcess: systemProcess})
      .then(() => mockProcess.verify());
  });

});

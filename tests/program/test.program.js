import {assert} from 'chai';
import {spy} from 'sinon';

import {Program} from '../../src/program';


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
    return program.run()
      .then(() => {
        throw new Error('Unexpected success');
      })
      .catch((error) => {
        assert.match(error.message, /unknown command: thing/);
      });
  });

  it('reports missing command', () => {
    let program = new Program([]);
    return program.run()
      .then(() => {
        throw new Error('Unexpected success');
      })
      .catch((error) => {
        assert.match(error.message, /No sub-command was specified/);
      });
  });

});

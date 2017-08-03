/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import webExt from '../../src/main';
import build from '../../src/cmd/build';
import run from '../../src/cmd/run';
import {main} from '../../src/program';


describe('webExt', () => {
  it('exposes main', () => {
    assert.equal(webExt.main, main);
  });

  it('exposes commands', () => {
    // This just checks a sample of commands.
    assert.equal(webExt.cmd.run, run);
    assert.equal(webExt.cmd.build, build);
  });
});

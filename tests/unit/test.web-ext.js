/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import webExt from '../../src/main';
import build from '../../src/cmd/build';
import run from '../../src/cmd/run';
import {main} from '../../src/program';
import {consoleStream} from '../../src/util/logger';


describe('webExt', () => {
  it('exposes main', () => {
    assert.equal(webExt.main, main);
  });

  it('exposes commands', () => {
    // This just checks a sample of commands.
    assert.equal(webExt.cmd.run, run);
    assert.equal(webExt.cmd.build, build);
  });

  it('gives you access to the log stream', () => {
    assert.equal(webExt.util.logger.consoleStream, consoleStream);
  });
});

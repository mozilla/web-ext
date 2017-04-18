/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import lintCommand from '../../../src/cmd/lint';
import {makeSureItFails} from '../helpers';

describe('lint', () => {

  it('creates and runs a linter', () => {
    const fakeLinter = sinon.spy(() => lintResult);
    const lintResult = {
      run: sinon.spy(() => Promise.resolve()),
    };
    return lintCommand({
      sourceDir: '/fake/source/dir',
    }, {
      linter: fakeLinter,
    })
      .then((actualLintResult) => {
        assert.equal(actualLintResult, lintResult);
        assert.equal(fakeLinter.called, true);
      });
  });

  it('fails when the linter fails', () => {
    const fakeLinter =
      sinon.spy(() => Promise.reject(new Error('linter error')));
    return lintCommand({
      sourceDir: '/fake/source/dir',
    }, {
      linter: fakeLinter,
    })
      .then(makeSureItFails(), (error) => {
        assert.match(error.message, /linter error/);
      });
  });

});

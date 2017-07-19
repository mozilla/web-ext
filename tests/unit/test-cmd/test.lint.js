/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import lintCommand from '../../../src/cmd/lint';

describe('lint', () => {

  it('creates and runs a linter', async () => {
    const fakeLinter = sinon.spy(() => lintResult);
    const lintResult = {
      run: sinon.spy(() => Promise.resolve()),
    };
    const actualLintResult = await lintCommand({
      sourceDir: '/fake/source/dir',
    }, {
      linter: fakeLinter,
    });
    assert.equal(actualLintResult, lintResult);
    assert.equal(fakeLinter.called, true);
  });

  it('fails when the linter fails', async () => {
    const fakeLinter =
      sinon.spy(() => Promise.reject(new Error('linter error')));
    let exception;
    try {
      await lintCommand({
        sourceDir: '/fake/source/dir',
      }, {
        linter: fakeLinter,
      });
    } catch (linterError) {
      exception = linterError;
    }

    assert.match(exception && exception.message, /linter error/);
  });

});

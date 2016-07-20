/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import defaultLintCommand from '../../src/cmd/lint';
import {makeSureItFails} from '../helpers';

describe('lint', () => {

  function setUp({createLinter} = {}) {
    const lintResult = '<lint.run() result placeholder>';
    const runLinter = sinon.spy(() => Promise.resolve(lintResult));
    if (!createLinter) {
      createLinter = sinon.spy(() => {
        return {run: runLinter};
      });
    }
    return {
      lintResult,
      createLinter,
      runLinter,
      lint: ({...args}) => {
        return defaultLintCommand(args, {createLinter});
      },
    };
  }

  it('creates and runs a linter', () => {
    const {lint, createLinter, runLinter, lintResult} = setUp();
    return lint().then((actualLintResult) => {
      assert.equal(actualLintResult, lintResult);
      assert.equal(createLinter.called, true);
      assert.equal(runLinter.called, true);
    });
  });

  it('fails when the linter fails', () => {
    const createLinter = () => {
      return {
        run: () => Promise.reject(new Error('some error from the linter')),
      };
    };
    const {lint} = setUp({createLinter});
    return lint().then(makeSureItFails(), (error) => {
      assert.match(error.message, /error from the linter/);
    });
  });

  it('runs as a binary', () => {
    const {lint, createLinter} = setUp();
    return lint().then(() => {
      const args = createLinter.firstCall.args[0];
      assert.equal(args.runAsBinary, true);
    });
  });

  it('passes sourceDir to the linter', () => {
    const {lint, createLinter} = setUp();
    return lint({sourceDir: '/some/path'}).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config._[0], '/some/path');
    });
  });

  it('configures the linter when verbose', () => {
    const {lint, createLinter} = setUp();
    return lint({verbose: true}).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config.logLevel, 'debug');
      assert.equal(config.stack, true);
    });
  });

  it('configures the linter when not verbose', () => {
    const {lint, createLinter} = setUp();
    return lint({verbose: false}).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config.logLevel, 'fatal');
      assert.equal(config.stack, false);
    });
  });

  it('passes through linter configuration', () => {
    const {lint, createLinter} = setUp();
    return lint({
      pretty: 'pretty flag',
      metadata: 'metadata flag',
      output: 'output value',
      boring: 'boring flag',
      selfHosted: 'self-hosted flag',
    }).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config.pretty, 'pretty flag');
      assert.equal(config.metadata, 'metadata flag');
      assert.equal(config.output, 'output value');
      assert.equal(config.boring, 'boring flag');
      assert.equal(config.selfHosted, 'self-hosted flag');
    });
  });

});

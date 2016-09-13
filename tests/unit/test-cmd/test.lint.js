/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import defaultLintCommand from '../../../src/cmd/lint';
import {FileFilter} from '../../../src/cmd/build';
import {fake, makeSureItFails} from '../helpers';

describe('lint', () => {

  function setUp({createLinter, fileFilter}: Object = {}) {
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
        // $FLOW_IGNORE: type checks skipped for testing purpose
        return defaultLintCommand(args, {createLinter, fileFilter});
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
      // $FLOW_IGNORE: wrong type used for testing purpose
      pretty: 'pretty flag',
      // $FLOW_IGNORE: wrong type used for testing purpose
      metadata: 'metadata flag',
      // $FLOW_IGNORE: wrong type used for testing purpose
      output: 'output value',
      // $FLOW_IGNORE: wrong type used for testing purpose
      boring: 'boring flag',
      // $FLOW_IGNORE: wrong type used for testing purpose
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

  it('passes a file filter to the linter', () => {
    const fileFilter = fake(new FileFilter());
    const {lint, createLinter} = setUp({fileFilter});
    return lint()
      .then(() => {
        assert.equal(createLinter.called, true);
        const config = createLinter.firstCall.args[0].config;
        assert.isFunction(config.shouldScanFile);

        // Simulate how the linter will use this callback.
        config.shouldScanFile('manifest.json');
        assert.equal(fileFilter.wantFile.called, true);
        assert.equal(fileFilter.wantFile.firstCall.args[0], 'manifest.json');
      });
  });

});

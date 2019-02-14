/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import defaultLintCommand from '../../../src/cmd/lint';

type setUpParams = {|
  createLinter?: Function,
  createFileFilter?: Function,
|}

describe('lint', () => {

  function setUp({createLinter, createFileFilter}: setUpParams = {}) {
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
      lint: (params = {}, options = {}) => {
        return defaultLintCommand({
          sourceDir: '/fake/source/dir',
          ...params,
        }, {
          createLinter,
          createFileFilter,
          ...options,
        });
      },
    };
  }

  it('creates and runs a linter', () => {
    const {lint, createLinter, runLinter, lintResult} = setUp();
    return lint().then((actualLintResult) => {
      assert.equal(actualLintResult, lintResult);
      sinon.assert.called(createLinter);
      sinon.assert.called(runLinter);
    });
  });

  it('fails when the linter fails', async () => {
    const createLinter = () => {
      return {
        run: () => Promise.reject(new Error('some error from the linter')),
      };
    };
    const {lint} = setUp({createLinter});

    await assert.isRejected(lint(), /error from the linter/);
  });

  it('runs as a binary', () => {
    const {lint, createLinter} = setUp();
    return lint().then(() => {
      sinon.assert.calledWithMatch(createLinter, {runAsBinary: true});
    });
  });

  it('sets runAsBinary according shouldExitProgram option', () => {
    const {lint, createLinter} = setUp();
    return lint({}, {shouldExitProgram: false}).then(() => {
      sinon.assert.calledWithMatch(createLinter, {runAsBinary: false});
    });
  });

  it('passes sourceDir to the linter', () => {
    const {lint, createLinter} = setUp();
    return lint({sourceDir: '/some/path'}).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config._[0], '/some/path');
    });
  });

  it('passes warningsAsErrors to the linter', () => {
    const {lint, createLinter} = setUp();
    return lint({warningsAsErrors: true}).then(() => {
      sinon.assert.calledWithMatch(createLinter, {
        config: {
          warningsAsErrors: true,
        },
      });
    });
  });

  it('passes warningsAsErrors undefined to the linter', () => {
    const {lint, createLinter} = setUp();
    return lint().then(() => {
      sinon.assert.calledWithMatch(createLinter, {
        config: {
          warningsAsErrors: undefined,
        },
      });
    });
  });

  it('configures the linter when verbose', () => {
    const {lint, createLinter} = setUp();
    return lint({verbose: true}).then(() => {
      sinon.assert.calledWithMatch(createLinter, {
        config: {
          logLevel: 'debug',
          stack: true,
        },
      });
    });
  });

  it('configures the linter when not verbose', () => {
    const {lint, createLinter} = setUp();
    return lint({verbose: false}).then(() => {
      sinon.assert.calledWithMatch(createLinter, {
        config: {
          logLevel: 'fatal',
          stack: false,
        },
      });
    });
  });

  it('passes through linter configuration', () => {
    const {lint, createLinter} = setUp();
    return lint({
      pretty: true,
      metadata: true,
      output: 'json',
      boring: true,
      selfHosted: true,
    }).then(() => {
      sinon.assert.calledWithMatch(createLinter, {
        config: {
          pretty: true,
          metadata: true,
          output: 'json',
          boring: true,
          selfHosted: true,
        },
      });
    });
  });

  it('configures a lint command with the expected fileFilter', () => {
    const fileFilter = {wantFile: sinon.spy(() => true)};
    const createFileFilter = sinon.spy(() => fileFilter);
    const {lint, createLinter} = setUp({createFileFilter});
    const params = {
      sourceDir: '.',
      artifactsDir: 'artifacts',
      ignoreFiles: ['file1', '**/file2'],
    };
    return lint(params).then(() => {
      sinon.assert.calledWith(createFileFilter, params);

      assert.ok(createLinter.called);
      const {shouldScanFile} = createLinter.firstCall.args[0].config;
      shouldScanFile('path/to/file');
      sinon.assert.calledWith(fileFilter.wantFile, 'path/to/file');
    });
  });

});

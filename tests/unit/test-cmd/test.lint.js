/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import defaultLintCommand from '../../../src/cmd/lint';
import {makeSureItFails} from '../helpers';

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

  it('sets runAsBinary according shouldExitProgram option', () => {
    const {lint, createLinter} = setUp();
    return lint({}, {shouldExitProgram: false}).then(() => {
      const args = createLinter.firstCall.args[0];
      assert.strictEqual(args.runAsBinary, false);
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
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config.warningsAsErrors, true);
    });
  });

  it('passes warningsAsErrors undefined to the linter', () => {
    const {lint, createLinter} = setUp();
    return lint().then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config.warningsAsErrors, undefined);
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
      pretty: true,
      metadata: true,
      output: 'json',
      boring: true,
      selfHosted: true,
    }).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.strictEqual(config.pretty, true);
      assert.strictEqual(config.metadata, true);
      assert.strictEqual(config.output, 'json');
      assert.strictEqual(config.boring, true);
      assert.strictEqual(config.selfHosted, true);
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
      assert.ok(createFileFilter.called);
      assert.deepEqual(createFileFilter.firstCall.args[0], params);

      assert.ok(createLinter.called);
      const {shouldScanFile} = createLinter.firstCall.args[0].config;
      shouldScanFile('path/to/file');
      assert.ok(fileFilter.wantFile.called);
      assert.equal(fileFilter.wantFile.firstCall.args[0], 'path/to/file');
    });
  });

});

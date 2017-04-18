import path from 'path';

import {fs} from 'mz';
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {linter} from '../../../src/util/linter';
import {withTempDir} from '../../../src/util/temp-dir';
import {makeSureItFails} from '../helpers';

describe('util.linter', () => {

  function prepare() {
    const sourceDir = '/some/path';
    const fakeFileFilter = {
      wantFile: sinon.spy(() => Promise.resolve()),
    };
    const fakeFilterCreator = sinon.spy(() => fakeFileFilter);

    const fakeCreateLinter = sinon.spy(() => fakeLinterInstance);
    const fakeLinterInstance = {
      run: sinon.spy(() => Promise.resolve()),
    };

    const params = {
      sourceDir,
      artifactsDir: 'artifacts',
      ignoreFiles: [],
      verbose: false,
      filePath: null,
    };

    const config = {
      _: [sourceDir],
      logLevel: 'fatal',
      stack: false,
      pretty: true,
      warningsAsErrors: false,
      metadata: false,
      selfHosted: false,
      boring: false,
      output: 'text',
      scanFile: null,
      shouldScanFile: null,
      runAsBinary: false,
    };

    const options = {
      createLinter: fakeCreateLinter,
      fileFilterCreator: fakeFilterCreator,
    };

    return {
      fakeFileFilter,
      fakeLinterInstance,
      params,
      config,
      options,
      lint: (customParams = {}, customConfig = {}, customOptions = {}) =>
        linter(
          {...params, ...customParams},
          {...config, ...customConfig},
          {...options, ...customOptions},
      ),
    };
  }

  it('runs linter for a directory with correct config', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        const artifactsDir = path.join(tmpDir.path(), 'web-ext-artifacts');
        const {options, fakeLinterInstance, lint} = prepare();
        const {createLinter} = options;

        const expectedConfig = {
          _: [sourceDir],
          logLevel: 'fatal',
          stack: false,
          pretty: true,
          warningsAsErrors: false,
          metadata: false,
          selfHosted: false,
          scanFile: null,
          shouldScanFile: null,
        };

        return fs.mkdir(artifactsDir)
          .then(() => {
            return lint({
              sourceDir,
              artifactsDir,
            });
          })
          .then(() => {
            const config = createLinter.firstCall.args[0].config;
            config.shouldScanFile = null;
            assert.ok(createLinter.called);
            assert.equal(createLinter.firstCall.args[0].runAsBinary,
                         false);
            assert.deepEqual(config, expectedConfig);
            assert.ok(fakeLinterInstance.run.called);
          });
      }
    ));

  it('runs linter for a specified files with correct config', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        const artifactsDir = path.join(tmpDir.path(), 'web-ext-artifacts');
        const filePath = path.join(tmpDir.path(), 'foo.txt');
        const {options, fakeLinterInstance, lint} = prepare();
        const {createLinter} = options;

        const expectedConfig = {
          _: [sourceDir],
          logLevel: 'fatal',
          stack: false,
          pretty: true,
          warningsAsErrors: false,
          metadata: false,
          selfHosted: false,
          scanFile: ['foo.txt'],
          shouldScanFile: null,
        };


        return lint({
          sourceDir,
          artifactsDir,
          filePath,
        })
          .then(() => {
            const config = createLinter.firstCall.args[0].config;
            assert.ok(createLinter.called);
            assert.equal(createLinter.firstCall.args[0].runAsBinary,
                         false);
            assert.deepEqual(config.scanFile, expectedConfig.scanFile);
            assert.deepEqual(config, expectedConfig);
            assert.ok(fakeLinterInstance.run.called);
          });
      }
    ));

  it('fails when the linter fails', () => {
    const fakeLinterInstance = {
      run: sinon.spy(() => Promise.reject(new Error('linter error'))),
    };
    const createLinter = () => fakeLinterInstance;
    const {lint} = prepare();
    return lint({}, {}, {createLinter})
      .then(makeSureItFails(), (error) => {
        assert.ok(fakeLinterInstance.run.called);
        assert.match(error.message, /linter error/);
      });
  });

  it('runs as a binary', () => {
    const {lint, options} = prepare();
    const {createLinter} = options;
    return lint({}, {runAsBinary: true})
      .then(() => {
        const args = createLinter.firstCall.args[0];
        assert.equal(args.runAsBinary, true);
      });
  });

  it('configures the linter when verbose', () => {
    const {lint, options} = prepare();
    const {createLinter} = options;
    return lint({verbose: true}).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config.logLevel, 'debug');
      assert.equal(config.stack, true);
    });
  });

  it('configures the linter when not verbose', () => {
    const {lint, options} = prepare();
    const {createLinter} = options;
    return lint({}).then(() => {
      const config = createLinter.firstCall.args[0].config;
      assert.equal(config.logLevel, 'fatal');
      assert.equal(config.stack, false);
    });
  });

  it('configures a lint command with the expected fileFilter', () => {
    const {lint, options, fakeFileFilter} = prepare();
    const {fileFilterCreator, createLinter} = options;
    const params = {
      sourceDir: '.',
      artifactsDir: 'artifacts',
      ignoreFiles: ['file1', '**/file2'],
    };
    return lint(params)
      .then(() => {
        assert.ok(fileFilterCreator.called);
        assert.deepEqual(fileFilterCreator.firstCall.args[0], params);

        assert.ok(createLinter.called);
        const {shouldScanFile} = createLinter.firstCall.args[0].config;
        shouldScanFile('path/to/file');
        assert.ok(fakeFileFilter.wantFile.called);
        assert.equal(fakeFileFilter.wantFile.firstCall.args[0], 'path/to/file');
      });
  });

});

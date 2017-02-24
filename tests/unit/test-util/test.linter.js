import path from 'path';

import {fs} from 'mz';
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {linter} from '../../../src/util/linter';
import {withTempDir} from '../../../src/util/temp-dir';
// import {makeSureItFails} from '../helpers';

describe('util.linter', () => {

  const fakeFileFilter = {wantFile: sinon.spy(() => Promise.resolve())};
  const fakeFilterCreator = sinon.spy(() => Promise.resolve(fakeFileFilter));

  it('calls addon-linter when linting directory', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        const artifactsDir = path.join(tmpDir.path(), 'web-ext-artifacts');

        const expectedConfig = {
          logLevel: 'fatal',
          stack: true,
          pretty: true,
          warningsAsErrors: false,
          metadata: false,
          scanFile: null,
          shouldScanFile: null,
          _: [sourceDir],
        };

        const fakeCreateLinter = sinon.spy(() => fakeLinterInstance);
        const fakeLinterInstance = {
          run: sinon.spy(() => Promise.resolve()),
        };

        return fs.mkdir(artifactsDir)
          .then(() => {
            return linter({
              sourceDir,
              artifactsDir,
              createLinter: fakeCreateLinter,
              fileFilterCreator: fakeFilterCreator,
            });
          })
          .then(() => {
            const config = fakeCreateLinter.firstCall.args[0].config;
            config.shouldScanFile = null;
            assert.ok(fakeCreateLinter.called);
            assert.equal(fakeCreateLinter.firstCall.args[0].runAsBinary,
                         false);
            assert.deepEqual(config, expectedConfig);
            assert.ok(fakeLinterInstance.run.called);
          });
      }
    ));

  it('calls addon-linter when specified files', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        const artifactsDir = path.join(tmpDir.path(), 'web-ext-artifacts');
        const file = path.join(tmpDir.path(), 'foo.txt');

        const expectedConfig = {
          logLevel: 'fatal',
          stack: true,
          pretty: true,
          warningsAsErrors: false,
          metadata: false,
          scanFile: ['foo.txt'],
          shouldScanFile: null,
          _: [sourceDir],
        };

        const fakeCreateLinter = sinon.spy(() => fakeLinterInstance);
        const fakeLinterInstance = {
          run: sinon.spy(() => Promise.resolve()),
        };


        return linter({
          sourceDir,
          artifactsDir,
          createLinter: fakeCreateLinter,
          fileFilterCreator: fakeFilterCreator,
          filePath: file,
        })
          .then(() => {
            const config = fakeCreateLinter.firstCall.args[0].config;
            config.shouldScanFile = null;
            assert.ok(fakeCreateLinter.called);
            assert.equal(fakeCreateLinter.firstCall.args[0].runAsBinary,
                         false);
            assert.deepEqual(config.scanFile, expectedConfig.scanFile);
            assert.deepEqual(config, expectedConfig);
            assert.ok(fakeLinterInstance.run.called);
          });
      }
    ));

});

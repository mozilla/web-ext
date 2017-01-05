/* @flow */
import path from 'path';

import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';
import {fs} from 'mz';

import {onlyInstancesOf, UsageError} from '../../../src/errors';
import {withTempDir} from '../../../src/util/temp-dir';
import {prepareArtifactsDir} from '../../../src/util/artifacts';
import {makeSureItFails} from '../helpers';


describe('prepareArtifactsDir', () => {

  it('creates an artifacts dir if needed', () => withTempDir(
    (tmpDir) => {
      const artifactsDir = path.join(tmpDir.path(), 'build');
      return prepareArtifactsDir(artifactsDir)
        .then(() => {
          // This should not throw an error if created properly.
          return fs.stat(artifactsDir);
        });
    }
  ));

  it('ignores existing artifacts dir', () => withTempDir(
    (tmpDir) =>
      prepareArtifactsDir(tmpDir.path())
        .then(() => {
          // Make sure everything is still cool with this path.
          return fs.stat(tmpDir.path());
        })
  ));

  it('ensures the path is really a directory', () => withTempDir(
    (tmpDir) => {
      const someFile = path.join(tmpDir.path(), 'some-file.txt');
      return fs.writeFile(someFile, 'some content')
        .then(() => prepareArtifactsDir(someFile))
        .then(makeSureItFails())
        .catch(onlyInstancesOf(UsageError, (error) => {
          assert.match(error.message, /not a directory/);
        }));
    }
  ));

  it('resolves with the artifacts dir', () => withTempDir(
    (tmpDir) => {
      const artifactsDir = path.join(tmpDir.path(), 'artifacts');
      return prepareArtifactsDir(artifactsDir)
        .then((resolvedDir) => {
          assert.equal(resolvedDir, artifactsDir);
        });
    }
  ));

  it('throws error when checking the directory if lacks writing permissions',
    () => withTempDir(
    (tmpDir) => {
      const tmpPath = path.join(tmpDir.path(), 'build');
      return fs.mkdir(tmpPath, '0622').then(() => {
        const artifactsDir = path.join(tmpPath, 'artifacts');
        return prepareArtifactsDir(artifactsDir)
          .then(makeSureItFails())
          .catch(onlyInstancesOf(UsageError, (error) => {
            assert.match(error.message, /lack permissions/);
          }));
      });
    }
  ));

  it('throws error when creating a folder if lacks writing permissions',
    () => withTempDir(
    (tmpDir) => {
      class ErrorWithCode extends Error {
        code: string;
        constructor(code) {
          super('some error');
          this.code = code;
        }
      }

      const tmpPath = path.join(tmpDir.path(), 'build');
      const fakeFS = {
        mkdir: sinon.spy(() => Promise.reject(new ErrorWithCode('EACCES'))),
        stat: sinon.spy(() => Promise.reject(new ErrorWithCode('ENOENT'))),
      };
      return prepareArtifactsDir(tmpPath, fakeFS)
        .then(makeSureItFails())
        .catch(onlyInstancesOf(UsageError, (error) => {
          assert.match(error.message, /lack permissions/);
        }));
    }
 ));

});

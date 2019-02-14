/* @flow */
import path from 'path';

import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';
import {fs} from 'mz';


import {onlyInstancesOf, UsageError} from '../../../src/errors';
import {withTempDir} from '../../../src/util/temp-dir';
import {prepareArtifactsDir} from '../../../src/util/artifacts';
import {makeSureItFails, ErrorWithCode} from '../helpers';


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

  it('throws an UsageError when it lacks permissions to stat the directory',
     function() {
       return withTempDir(
         (tmpDir) => {
           if (process.platform === 'win32') {
             this.skip();
             return;
           }
           const tmpPath = path.join(tmpDir.path(), 'build');
           return fs.mkdir(tmpPath, '0622').then(() => {
             const artifactsDir = path.join(tmpPath, 'artifacts');
             return prepareArtifactsDir(artifactsDir)
               .then(makeSureItFails())
               .catch(onlyInstancesOf(UsageError, (error) => {
                 assert.match(error.message,
                              /Cannot access.*lacks permissions/);
               }));
           });
         }
       );
     });

  it('throws error when directory exists but lacks writing permissions',
     function() {
       return withTempDir(
         (tmpDir) => {
           if (process.platform === 'win32') {
             this.skip();
             return;
           }
           const artifactsDir = path.join(tmpDir.path(), 'dir-nowrite');
           return fs.mkdir(artifactsDir, '0555').then(() => {
             return prepareArtifactsDir(artifactsDir)
               .then(makeSureItFails())
               .catch(onlyInstancesOf(UsageError, (error) => {
                 assert.match(error.message, /exists.*lacks permissions/);
               }));
           });
         }
       );
     });

  it('throws error when creating a folder if lacks writing permissions',
     function() {
       return withTempDir(
         (tmpDir) => {
           if (process.platform === 'win32') {
             this.skip();
             return;
           }
           const parentDir = path.join(tmpDir.path(), 'dir-nowrite');
           const artifactsDir = path.join(parentDir, 'artifacts');
           return fs.mkdir(parentDir, '0555').then(() => {
             return prepareArtifactsDir(artifactsDir)
               .then(makeSureItFails())
               .catch(onlyInstancesOf(UsageError, (error) => {
                 assert.match(error.message,
                              /Cannot create.*lacks permissions/);
               }));
           });
         }
       );
     });

  it('creates the artifacts dir successfully if the parent dir does not exist',
     () => withTempDir(
       (tmpDir) => {
         const tmpPath = path.join(tmpDir.path(), 'build', 'subdir');
         return prepareArtifactsDir(tmpPath)
           .then((resolvedDir) => {
             assert.equal(resolvedDir, tmpPath);
           });
       }
     ));

  it('throws error when creating a folder if there is not enough space',
     () => withTempDir(
       async (tmpDir) => {
         const fakeAsyncMkdirp = sinon.spy(
           () => Promise.reject(new ErrorWithCode('ENOSPC', 'an error'))
         );
         const tmpPath = path.join(tmpDir.path(), 'build', 'subdir');

         await assert.isRejected(
           prepareArtifactsDir(tmpPath, {asyncMkdirp: fakeAsyncMkdirp}),
           'ENOSPC: an error');

         sinon.assert.called(fakeAsyncMkdirp);
       }
     ));

});

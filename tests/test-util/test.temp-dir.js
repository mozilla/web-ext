/* @flow */
import {describe, it} from 'mocha';
import fs from 'mz/fs';
import {assert} from 'chai';

import {withTempDir, TempDir} from '../../src/util/temp-dir';
import {makeSureItFails} from '../helpers';


describe('util.withTempDir', () => {

  it('creates a temp directory', () => withTempDir(
    (tmpDir) => {
      // Make sure the directory exists.
      return fs.stat(tmpDir.path());
    }
  ));

  it('destroys the directory on completion', () => {
    return withTempDir(
      (tmpDir) => Promise.resolve(tmpDir.path()))
      .then((tmpPath) => fs.stat(tmpPath))
      .then(makeSureItFails())
      .catch((error) => {
        assert.match(error.message, /ENOENT.* stat/);
      });
  });

  it('destroys the directory on error', () => {
    var tmpPath;
    var tmpPathExisted = false;
    return withTempDir(
      (tmpDir) => {
        tmpPath = tmpDir.path();
        return fs.stat(tmpPath)
          .then(() => {
            tmpPathExisted = true;
            throw new Error('simulated error');
          });
      })
      .then(makeSureItFails())
      .catch(() => {
        assert.equal(tmpPathExisted, true);
        return fs.stat(tmpPath);
      })
      .catch((error) => {
        assert.match(error.message, /ENOENT.* stat/);
      });
  });

});


describe('util.TempDir', () => {

  it('requires you to create the directory before accessing path()', () => {
    let tmp = new TempDir();
    assert.throws(() => tmp.path(), /cannot access path.* before.* create/);
  });

});

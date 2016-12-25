/* @flow */
import path from 'path';

import {fs} from 'mz';
import {assert} from 'chai';
import {describe, it} from 'mocha';

import isDirectory from '../../../src/util/is-directory';
import {withTempDir} from '../../../src/util/temp-dir';


describe('util.isDirectory', () => {

  it('resolves true for a directory', () => withTempDir(
    (tmpDir) => {
      return isDirectory(tmpDir.path())
        .then((dirExists) => {
          assert.equal(dirExists, true);
        });
    }
  ));

  it('resolves false for non-existent paths', () => {
    return isDirectory('/dev/null/not-a-real-path-at-all')
      .then((dirExists) => {
        assert.equal(dirExists, false);
      });
  });

  it('resolves false for non-directory paths', () => withTempDir(
    (tmpDir) => {
      const filePath = path.join(tmpDir.path(), 'some.txt');
      return fs.writeFile(filePath, 'some text')
        .then(() => isDirectory(filePath))
        .then((dirExists) => {
          assert.equal(dirExists, false);
        });
    }
  ));

  it('resolves false for incomplete directory paths', () => withTempDir(
    (tmpDir) => {
      return isDirectory(path.join(tmpDir.path(), 'missing-leaf'))
        .then((dirExists) => {
          assert.equal(dirExists, false);
        });
    }
  ));

});

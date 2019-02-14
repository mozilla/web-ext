/* @flow */
import path from 'path';

import {assert} from 'chai';
import {describe, it} from 'mocha';
import {fs} from 'mz';

import fileExists from '../../../src/util/file-exists';
import {withTempDir} from '../../../src/util/temp-dir';
import {ErrorWithCode} from '../helpers';


describe('util/file-exists', () => {
  it('returns true for existing files', () => {
    return withTempDir(
      async (tmpDir) => {
        const someFile = path.join(tmpDir.path(), 'file.txt');
        await fs.writeFile(someFile, '');

        assert.equal(await fileExists(someFile), true);
      });
  });

  it('returns false for non-existent files', () => {
    return withTempDir(
      async (tmpDir) => {
        // This file does not exist.
        const someFile = path.join(tmpDir.path(), 'file.txt');

        assert.equal(await fileExists(someFile), false);
      });
  });

  it('returns false for directories', () => {
    return withTempDir(
      async (tmpDir) => {
        assert.equal(await fileExists(tmpDir.path()), false);
      });
  });

  it('returns false for unreadable files', async () => {
    const exists = await fileExists('pretend/unreadable/file', {
      fileIsReadable: async () => {
        throw new ErrorWithCode('EACCES', 'permission denied');
      },
    });
    assert.equal(exists, false);
  });

  it('throws unexpected errors', async () => {
    const exists = fileExists('pretend/file', {
      fileIsReadable: async () => {
        throw new ErrorWithCode('EBUSY', 'device is busy');
      },
    });

    await assert.isRejected(exists, 'EBUSY: device is busy');
  });
});

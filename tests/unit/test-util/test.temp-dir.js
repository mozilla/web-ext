import { describe, it } from 'mocha';
import { fs } from 'mz';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { withTempDir, TempDir } from '../../../src/util/temp-dir.js';

describe('util.withTempDir', () => {
  it('creates a temp directory', () =>
    withTempDir((tmpDir) => {
      // Make sure the directory exists.
      return fs.stat(tmpDir.path());
    }));

  it('destroys the directory on completion', async () => {
    const tmpPath = await withTempDir((tmpDir) => {
      return tmpDir.path();
    });
    await assert.isRejected(fs.stat(tmpPath), /ENOENT.* stat/);
  });

  it('destroys the directory on error', async () => {
    let tmpPath;
    let tmpPathExisted = false;

    await assert.isRejected(
      withTempDir(async (tmpDir) => {
        tmpPath = tmpDir.path();
        tmpPathExisted = Boolean(await fs.stat(tmpPath));
        throw new Error('simulated error');
      }),
      'simulated error'
    );

    assert.equal(tmpPathExisted, true);
    await assert.isRejected(fs.stat(tmpPath), /ENOENT.* stat/);
  });
});

describe('util.TempDir', () => {
  it('requires you to create the directory before accessing path()', () => {
    const tmp = new TempDir();
    assert.throws(() => tmp.path(), /cannot access path.* before.* create/);
  });

  it('does not throw on remove called before a temp dir is created', async () => {
    const tmp = new TempDir();
    assert.equal(tmp._removeTempDir, undefined);
    tmp.remove();

    await tmp.create();
    assert.equal(typeof tmp._removeTempDir, 'function');

    tmp._removeTempDir = sinon.spy(tmp._removeTempDir);
    tmp.remove();

    sinon.assert.calledOnce(tmp._removeTempDir);
  });
});

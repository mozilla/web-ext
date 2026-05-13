import path from 'path';
import fs from 'fs/promises';

import { it, describe } from 'mocha';
import * as sinon from 'sinon';
import { assert } from 'chai';
import Watchpack from 'watchpack';

import {
  default as onSourceChange,
  proxyFileChanges,
} from '../../src/watcher.js';
import { withTempDir } from '../../src/util/temp-dir.js';
import { makeSureItFails } from './helpers.js';

describe('watcher', () => {
  const watchChange = ({ prepTempDir, watchFile, touchedFile } = {}) =>
    withTempDir(async (tmpDir) => {
      const artifactsDir = path.join(tmpDir.path(), 'web-ext-artifacts');
      const someFile = path.join(tmpDir.path(), touchedFile);
      if (prepTempDir) {
        await prepTempDir(tmpDir);
      }

      if (watchFile) {
        watchFile = watchFile.map((f) => path.join(tmpDir.path(), f));
      }

      let resolveChange;
      const whenFilesChanged = new Promise((resolve) => {
        resolveChange = resolve;
      });
      const onChange = sinon.spy(() => {
        resolveChange();
      });

      await fs.writeFile(someFile, '<contents>');
      const watcher = onSourceChange({
        sourceDir: tmpDir.path(),
        watchFile,
        artifactsDir,
        onChange,
        shouldWatchFile: () => true,
      });

      const { fileWatchers, directoryWatchers } = watcher;
      let watchedFilePath;
      let watchedDirPath;

      if (fileWatchers?.size > 0) {
        watchedFilePath = Array.from(fileWatchers.keys())[0];
      }

      if (directoryWatchers?.size > 0) {
        watchedDirPath = Array.from(directoryWatchers.keys())[0];
      }

      await fs.utimes(someFile, Date.now() / 1000, Date.now() / 1000);
      const assertParams = {
        onChange,
        watchedFilePath,
        watchedDirPath,
        tmpDirPath: tmpDir.path(),
      };

      return Promise.race([
        whenFilesChanged.then(() => {
          watcher.close();
          // This delay seems to avoid stat errors from the watcher
          // which can happen when the temp dir is deleted (presumably
          // before watcher.close() has removed all listeners).
          return new Promise((resolve) => {
            setTimeout(resolve, 2, assertParams);
          });
        }),
        // Time out if no files are changed
        new Promise((resolve) =>
          setTimeout(() => {
            watcher.close();
            resolve(assertParams);
          }, 500),
        ),
      ]);
    });

  it('watches for changes in the sourceDir', async () => {
    const defaultDebounce = 500;
    const { onChange, watchedFilePath, watchedDirPath, tmpDirPath } =
      await watchChange({
        touchedFile: 'foo.txt',
      });

    await new Promise((resolve) => setTimeout(resolve, defaultDebounce + 50));

    sinon.assert.calledOnce(onChange);
    assert.equal(watchedDirPath, tmpDirPath);
    assert.isUndefined(watchedFilePath);
  });

  describe('--watch-file option is passed in', () => {
    it('changes if the watched file is touched', async () => {
      const { onChange, watchedFilePath, watchedDirPath, tmpDirPath } =
        await watchChange({
          watchFile: ['foo.txt'],
          touchedFile: 'foo.txt',
        });

      sinon.assert.calledOnce(onChange);
      assert.isUndefined(watchedDirPath);
      assert.equal(watchedFilePath, path.join(tmpDirPath, 'foo.txt'));
    });

    it('does not change if watched file is not touched', async () => {
      const { onChange, watchedFilePath, watchedDirPath, tmpDirPath } =
        await watchChange({
          watchFile: ['bar.txt'],
          touchedFile: 'foo.txt',
        });

      sinon.assert.notCalled(onChange);
      assert.isUndefined(watchedDirPath);
      assert.equal(watchedFilePath, path.join(tmpDirPath, 'bar.txt'));
    });

    it('throws error if a non-file is passed into --watch-file', () => {
      return watchChange({
        watchFile: ['/'],
        touchedFile: 'foo.txt',
      })
        .then(makeSureItFails())
        .catch((error) => {
          assert.match(
            error.message,
            /Invalid --watch-file value: .+ is not a file./,
          );
        });
    });
  });

  describe('proxyFileChanges', () => {
    const defaults = {
      artifactsDir: '/some/artifacts/dir/',
      onChange: () => {},
      shouldWatchFile: () => true,
    };

    it('proxies file changes', () => {
      const onChange = sinon.spy(() => {});
      proxyFileChanges({
        ...defaults,
        filePath: '/some/file.js',
        onChange,
      });
      sinon.assert.called(onChange);
    });

    it('ignores changes to artifacts', () => {
      const onChange = sinon.spy(() => {});
      proxyFileChanges({
        ...defaults,
        filePath: '/some/artifacts/dir/build.xpi',
        artifactsDir: '/some/artifacts/dir/',
        onChange,
      });
      sinon.assert.notCalled(onChange);
    });

    it('provides a callback for ignoring files', () => {
      function shouldWatchFile(filePath) {
        if (filePath === '/somewhere/freaky') {
          return false;
        } else {
          return true;
        }
      }

      const conf = {
        ...defaults,
        shouldWatchFile,
        onChange: sinon.spy(() => {}),
      };

      proxyFileChanges({ ...conf, filePath: '/somewhere/freaky' });
      sinon.assert.notCalled(conf.onChange);
      proxyFileChanges({ ...conf, filePath: '/any/file/' });
      sinon.assert.called(conf.onChange);
    });
  });

  describe('--watch-ignored is passed in', () => {
    it('does not call onChange if ignored file is touched', () =>
      withTempDir(async (tmpDir) => {
        const debounceTime = 10;
        const onChange = sinon.spy();
        const tmpPath = tmpDir.path();
        const files = ['foo.txt', 'bar.txt', 'foobar.txt'].map((filePath) =>
          path.join(tmpPath, filePath),
        );

        const watcher = onSourceChange({
          sourceDir: tmpPath,
          artifactsDir: path.join(tmpPath, 'web-ext-artifacts'),
          onChange,
          watchIgnored: ['foo.txt'].map((filePath) =>
            path.join(tmpPath, filePath),
          ),
          shouldWatchFile: (filePath) => filePath !== tmpPath,
          debounceTime,
        });

        const watchAll = new Watchpack();
        watchAll.watch({ files, directories: [], missing: [], startTime: 0 });

        async function waitDebounce() {
          await new Promise((resolve) => setTimeout(resolve, debounceTime * 2));
        }

        async function assertOnChange(filePath, expectedCallCount) {
          const promiseOnChanged = new Promise((resolve) =>
            watchAll.once('change', (f) => resolve(f)),
          );
          await waitDebounce();
          await fs.writeFile(filePath, '<content>');
          assert.equal(filePath, await promiseOnChanged);
          await waitDebounce();
          sinon.assert.callCount(onChange, expectedCallCount);
        }

        // Verify foo.txt is being ignored.
        await assertOnChange(files[0], 0);

        // Verify that the other two files are not be ignored.
        await assertOnChange(files[1], 1);
        await assertOnChange(files[2], 2);

        watcher.close();
        watchAll.close();
        // Leave watcher.close some time to complete its cleanup before withTempDir will remove the
        // test directory.
        await waitDebounce();
      }));
  });

  describe('watcher ignores _metadata', () => {
    // _metadata should be ignored to avoid reload loop, see:
    // https://github.com/mozilla/web-ext/issues/3468

    // _metadata/generated_indexed_rulesets/_ruleset1 (original test case)
    let promiseTouchedMetadataDirContent;
    // Immediate child of _metadata without subdirectory.
    let promiseTouchedMetadataDirWithoutSub;
    // _metadata is also ignored when nested, not just at the top.
    let promiseTouchedMetadataDirNested;
    // _metadata is a directory, but the implementation also ignores files...
    let promiseTouchedMetadataFile;
    // Check behavior of --watch-file=_metadata
    let promiseTouchedMetadataFileWithWatchFile;
    // Chrome may also write "Cached Theme.pak" (outside _metadata directory).
    let promiseTouchedTheme;

    it('ignores change to _metadata directory content (setup)', () => {
      // Simulates scenario from https://github.com/mozilla/web-ext/issues/3468
      promiseTouchedMetadataDirContent = watchChange({
        prepTempDir: async (tmpDir) => {
          const metadataDir = path.join(tmpDir.path(), '_metadata');
          await fs.mkdir(metadataDir);
          await fs.mkdir(path.join(metadataDir, 'generated_indexed_rulesets'));
        },
        touchedFile: path.join(
          '_metadata',
          'generated_indexed_rulesets',
          '_ruleset1',
        ),
      });
    });

    it('ignores change to _metadata directory without subdirectory (setup)', () => {
      // Simulates scenario from https://github.com/mozilla/web-ext/issues/3468
      promiseTouchedMetadataDirWithoutSub = watchChange({
        prepTempDir: async (tmpDir) => {
          await fs.mkdir(path.join(tmpDir.path(), '_metadata'));
        },
        touchedFile: path.join('_metadata', 'somefile'),
      });
    });

    it('ignores change to non-toplevel _metadata directory (setup)', () => {
      promiseTouchedMetadataDirNested = watchChange({
        prepTempDir: async (tmpDir) => {
          const parentDir = path.join(tmpDir.path(), 'parent');
          await fs.mkdir(parentDir);
          await fs.mkdir(path.join(parentDir, '_metadata'));
        },
        touchedFile: path.join('parent', '_metadata', 'somefile'),
      });
    });

    it('ignores change to _metadata file (setup)', () => {
      promiseTouchedMetadataFile = watchChange({ touchedFile: '_metadata' });
    });

    it('ignores change to _metadata file despite --watch-file (setup)', () => {
      promiseTouchedMetadataFileWithWatchFile = watchChange({
        watchFile: ['_metadata'],
        touchedFile: '_metadata',
      });
    });

    it('igmores change to Cached Theme.pak (setup)', () => {
      // When a theme is loaded in Chrome, it writes to "Cached Theme.pak" in
      // the source directory, which would result in permanent auto-reload
      // unless we disabled auto reload.
      promiseTouchedTheme = watchChange({ touchedFile: 'Cached Theme.pak' });
    });

    it('ignores change to _metadata directory content (await)', async () => {
      const { onChange } = await promiseTouchedMetadataDirContent;
      sinon.assert.notCalled(onChange);
    });

    it('ignores change to _metadata directory without subdirectory (await)', async () => {
      const { onChange } = await promiseTouchedMetadataDirWithoutSub;
      sinon.assert.notCalled(onChange);
    });

    it('ignores change to non-toplevel _metadata directory (await)', async () => {
      const { onChange } = await promiseTouchedMetadataDirNested;
      sinon.assert.notCalled(onChange);
    });

    it('ignores change to _metadata file (await)', async () => {
      const { onChange } = await promiseTouchedMetadataFile;
      sinon.assert.notCalled(onChange);
    });

    it('ignores change to _metadata file despite --watch-file (await)', async () => {
      const { onChange } = await promiseTouchedMetadataFileWithWatchFile;
      sinon.assert.notCalled(onChange);
    });

    it('igmores change to Cached Theme.pak (await)', async () => {
      const { onChange } = await promiseTouchedTheme;
      sinon.assert.notCalled(onChange);
    });
  });
});

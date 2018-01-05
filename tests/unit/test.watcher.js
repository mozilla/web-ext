/* @flow */
import path from 'path';

import {it, describe} from 'mocha';
import {fs} from 'mz';
import sinon from 'sinon';

import {default as onSourceChange, proxyFileChanges} from '../../src/watcher';
import {withTempDir} from '../../src/util/temp-dir';


describe('watcher', () => {

  it('watches for file changes', () => withTempDir(
    (tmpDir) => {
      const artifactsDir = path.join(tmpDir.path(), 'web-ext-artifacts');
      const someFile = path.join(tmpDir.path(), 'foo.txt');

      var resolveChange;
      const whenFilesChanged = new Promise((resolve) => {
        resolveChange = resolve;
      });
      const onChange = sinon.spy(() => {
        resolveChange();
      });

      return fs.writeFile(someFile, '<contents>')
        .then(() => {
          return onSourceChange({
            sourceDir: tmpDir.path(),
            artifactsDir,
            onChange,
            shouldWatchFile: () => true,
          });
        })
        .then((watcher) => {
          return fs.utimes(someFile, Date.now() / 1000, Date.now() / 1000)
            .then(() => watcher);
        })
        .then((watcher) => {
          return whenFilesChanged
            .then(() => {
              watcher.close();
              sinon.assert.calledOnce(onChange);
              // This delay seems to avoid stat errors from the watcher
              // which can happen when the temp dir is deleted (presumably
              // before watcher.close() has removed all listeners).
              return new Promise((resolve) => setTimeout(resolve, 2));
            });
        });
    }
  ));

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

      proxyFileChanges({...conf, filePath: '/somewhere/freaky'});
      sinon.assert.notCalled(conf.onChange);
      proxyFileChanges({...conf, filePath: '/any/file/'});
      sinon.assert.called(conf.onChange);
    });

  });

});

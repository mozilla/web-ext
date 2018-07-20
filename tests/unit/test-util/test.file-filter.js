/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import {FileFilter, isSubPath} from '../../../src/util/file-filter';

describe('util/file-filter', () => {

  const newFileFilter = (params = {}) => {
    return new FileFilter({
      sourceDir: '.',
      ...params,
    });
  };

  describe('default', () => {
    const defaultFilter = newFileFilter();

    it('ignores long XPI paths', () => {
      assert.equal(defaultFilter.wantFile('path/to/some.xpi'), false);
    });

    it('ignores short XPI paths', () => {
      assert.equal(defaultFilter.wantFile('some.xpi'), false);
    });

    it('ignores .git directories', () => {
      assert.equal(defaultFilter.wantFile('.git'), false);
    });

    it('ignores nested .git directories', () => {
      assert.equal(defaultFilter.wantFile('path/to/.git'), false);
    });

    it('ignores any hidden file', () => {
      assert.equal(defaultFilter.wantFile('.whatever'), false);
    });

    it('ignores subdirectories within hidden folders', () => {
      assert.equal(defaultFilter.wantFile('.git/some/other/stuff'), false);
    });

    it('ignores ZPI paths', () => {
      assert.equal(defaultFilter.wantFile('path/to/some.zip'), false);
    });

    it('allows other files', () => {
      assert.equal(defaultFilter.wantFile('manifest.json'), true);
    });

    it('ignores node_modules by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/node_modules'), false);
    });

    it('ignores module content within node_modules by default', () => {
      assert.equal(defaultFilter.wantFile('node_modules/something/file.js'),
                   false);
    });

  });

  describe('options', () => {

    it('override the defaults with baseIgnoredPatterns', () => {
      const filter = newFileFilter({
        baseIgnoredPatterns: ['manifest.json'],
      });
      assert.equal(filter.wantFile('some.xpi'), true);
      assert.equal(filter.wantFile('manifest.json'), false);
    });

    it('add more files to ignore with ignoreFiles', () => {
      const filter = newFileFilter({
        ignoreFiles: ['*.log'],
      });
      assert.equal(filter.wantFile('some.xpi'), false);
      assert.equal(filter.wantFile('some.log'), false);
    });

    it('ignore artifactsDir and its content', () => {
      const filter = newFileFilter({
        artifactsDir: 'artifacts',
      });
      assert.equal(filter.wantFile('artifacts'), false);
      assert.equal(filter.wantFile('artifacts/some.js'), false);
    });

    it('does not ignore an artifactsDir outside of sourceDir', () => {
      const filter = newFileFilter({
        artifactsDir: '.',
        sourceDir: 'dist',
      });
      assert.equal(filter.wantFile('file'), true);
      assert.equal(filter.wantFile('dist/file'), true);
    });

    it('resolve relative path', () => {
      const filter = newFileFilter({
        sourceDir: '/src',
        artifactsDir: 'artifacts',
        ignoreFiles: [
          'ignore-dir/', 'some.js', '**/some.log', 'ignore/dir/content/**/*',
        ],
      });
      assert.equal(filter.wantFile('/src/artifacts'), true);
      assert.equal(filter.wantFile('/src/ignore-dir'), false);
      assert.equal(filter.wantFile('/src/ignore-dir/some.css'), true);
      assert.equal(filter.wantFile('/src/some.js'), false);
      assert.equal(filter.wantFile('/src/some.log'), false);
      assert.equal(filter.wantFile('/src/other/some.js'), true);
      assert.equal(filter.wantFile('/src/other/some.log'), false);
      assert.equal(filter.wantFile('/src/ignore/dir/content'), true);
      assert.equal(filter.wantFile('/src/ignore/dir/content/file.js'), false);
      // This file is not ignored because it's not relative to /src:
      assert.equal(filter.wantFile('/some.js'), true);
    });

  });

  describe('isSubPath', () => {
    it('test if target is a sub directory of src', () => {
      assert.equal(isSubPath('dist', '.'), false);
      assert.equal(isSubPath('.', 'artifacts'), true);
      assert.equal(isSubPath('.', '.'), false);
      assert.equal(isSubPath('/src/dist', '/src'), false);
      assert.equal(isSubPath('/src', '/src/artifacts'), true);
      assert.equal(isSubPath('/src', '/src'), false);
      assert.equal(isSubPath('/firstroot', '/secondroot'), false);
      assert.equal(isSubPath('/src', '/src/.dir'), true);
      assert.equal(isSubPath('/src', '/src/..dir'), true);
    });
  });

  describe('negation', () => {
    const filter = newFileFilter({
      sourceDir: '/src',
      ignoreFiles: [
        '!node_modules/libdweb/src/**',
      ],
    });

    it('ignore paths not captured by negation', () => {
      assert.equal(filter.wantFile('/src/node_modules/lib/foo.js'), false);
      assert.equal(filter.wantFile('/src/node_modules/lib'), false);
      assert.equal(filter.wantFile('/src/node_modules/what.js'), false);
      assert.equal(filter.wantFile('/src/node_modules/libdweb/what.js'), false);
      assert.equal(filter.wantFile('/src/node_modules/libdweb/src.js'), false);
      assert.equal(filter.wantFile('/src/node_modules/libdweb/src'), false);
    });

    it('includes paths captured by negation', () => {
      assert.equal(
        filter.wantFile('/src/node_modules/libdweb/src/lib.js'),
        true);
      assert.equal(
        filter.wantFile('/src/node_modules/libdweb/src/sub/lib.js'),
        true);
      assert.equal(
        filter.wantFile('/src/node_modules/libdweb/src/node_modules/lib.js'),
        true);
    });
  });

});

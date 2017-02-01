/* @flow */
import path from 'path';

import {describe, it} from 'mocha';
import {assert} from 'chai';

import {FileFilter, normalizeResolve} from '../../../src/util/file-filter';

describe('util/file-filter', () => {

  describe('default', () => {
    const defaultFilter = new FileFilter();

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
      const filter = new FileFilter({
        baseIgnoredPatterns: ['manifest.json'],
      });
      assert.equal(filter.wantFile('some.xpi'), true);
      assert.equal(filter.wantFile('manifest.json'), false);
    });

    it('add more files to ignore with ignoreFiles', () => {
      const filter = new FileFilter({
        ignoreFiles: ['*.log'],
      });
      assert.equal(filter.wantFile('some.xpi'), false);
      assert.equal(filter.wantFile('some.log'), false);
    });

    it('ignore artifactsDir and its content', () => {
      const filter = new FileFilter({
        artifactsDir: 'artifacts',
      });
      assert.equal(filter.wantFile('artifacts'), false);
      assert.equal(filter.wantFile('artifacts/some.js'), false);
    });

    it('resolve relative path', () => {
      const filter = new FileFilter({
        sourceDir: '/src',
        artifactsDir: 'artifacts',
        ignoreFiles: [
          'ignore-dir/', 'some.js', '**/some.log', 'ignore/dir/content/**/*',
        ],
      });
      assert.equal(filter.wantFile('/src/artifacts'), false);
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

  describe('normalizeResolve', () => {
    const paths = [
      'file', 'dir/',
      'path/to/file', 'path/to/dir/', 'path/to/../file', 'path/to/../dir/',
      'path/to/dir/.', 'path/to/dir/..',
    ];

    it('mimic path.resolve', () => {
      const src = '/src/';

      paths.forEach((file) => {
        assert.equal(
          path.resolve(src, file),
          path.join(path.resolve(src), normalizeResolve(file))
        );
      });
    });
  });

});

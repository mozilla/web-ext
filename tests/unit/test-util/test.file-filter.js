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

    it('ignores ZPI paths', () => {
      assert.equal(defaultFilter.wantFile('path/to/some.zip'), false);
    });

    it('allows other files', () => {
      assert.equal(defaultFilter.wantFile('manifest.json'), true);
    });

    it('ignores node_modules by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/node_modules'), false);
    });

  });

  describe('options', () => {

    it('override the defaults with filesToIgnore', () => {
      const filter = new FileFilter({
        filesToIgnore: ['manifest.json'],
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
        ignoreFiles: ['ignore-dir/', 'some.js', '**/some.log'],
      });
      assert.equal(filter.wantFile('/src/artifacts'), false);
      assert.equal(filter.wantFile('/src/ignore-dir'), false);
      assert.equal(filter.wantFile('/src/ignore-dir/some.css'), false);
      assert.equal(filter.wantFile('/src/some.js'), false);
      assert.equal(filter.wantFile('/src/some.log'), false);
      assert.equal(filter.wantFile('/src/other/some.js'), true);
      assert.equal(filter.wantFile('/src/other/some.log'), false);
    });

  });

});

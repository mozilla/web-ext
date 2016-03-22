/* @flow */
import {it, describe} from 'mocha';
import path from 'path';
import {assert} from 'chai';

import build,
  {prepareBuildDir, safeFileName, FileFilter} from '../../src/cmd/build';
import {withTempDir} from '../../src/util/temp-dir';
import {fixturePath, ZipFile} from '../helpers';
import fs from 'mz/fs';
import {basicManifest} from '../test-util/test.manifest';


describe('build', () => {

  describe('build', () => {

    it('zips a package', () => {
      let zipFile = new ZipFile();

      return withTempDir(
        (tmpDir) =>
          build({
            sourceDir: fixturePath('minimal-web-ext'),
            buildDir: tmpDir.path(),
          })
          .then((buildResult) => {
            assert.match(buildResult.extensionPath,
                         /minimal_extension-1\.0\.xpi$/);
            return buildResult.extensionPath;
          })
          .then((extensionPath) => zipFile.open(extensionPath))
          .then(() => zipFile.extractFilenames())
          .then((fileNames) => {
            fileNames.sort();
            assert.deepEqual(fileNames,
                             ['background-script.js', 'manifest.json']);
          })
      );
    });

    it('lets you specify a manifest', () => withTempDir(
      (tmpDir) =>
        build({
          sourceDir: fixturePath('minimal-web-ext'),
          buildDir: tmpDir.path(),
        }, {
          manifestData: basicManifest,
        })
        .then((buildResult) => {
          assert.match(buildResult.extensionPath,
                       /the_extension-0\.0\.1\.xpi$/);
          return buildResult.extensionPath;
        })
    ));

    it('asks FileFilter what files to include in the XPI', () => {
      let zipFile = new ZipFile();
      let fileFilter = new FileFilter({
        filesToIgnore: ['**/background-script.js'],
      });

      return withTempDir(
        (tmpDir) =>
          build({
            sourceDir: fixturePath('minimal-web-ext'),
            buildDir: tmpDir.path(),
          }, {fileFilter})
          .then((buildResult) => zipFile.open(buildResult.extensionPath))
          .then(() => zipFile.extractFilenames())
          .then((fileNames) => {
            assert.notInclude(fileNames, 'background-script.js');
          })
      );
    });

  });


  describe('prepareBuildDir', () => {

    it('creates a build dir if needed', () => withTempDir(
      (tmpDir) => {
        let buildDir = path.join(tmpDir.path(), 'build');
        return prepareBuildDir(buildDir)
          .then(() => {
            // This should not throw an error if created properly.
            return fs.stat(buildDir);
          });
      }
    ));

    it('ignores existing build dir', () => withTempDir(
      (tmpDir) =>
        prepareBuildDir(tmpDir.path())
        .then(() => {
          // Make sure everything is still cool with this path.
          return fs.stat(tmpDir.path());
        })
    ));

  });


  describe('safeFileName', () => {

    it('makes names safe for writing to a file system', () => {
      assert.equal(safeFileName('Bob Loblaw\'s 2005 law-blog.net'),
                   'bob_loblaw_s_2005_law-blog.net');
    });

  });

  describe('FileFilter', () => {
    const defaultFilter = new FileFilter();

    it('ignores long XPI paths by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/some.xpi'), false);
    });

    it('ignores short XPI paths by default', () => {
      assert.equal(defaultFilter.wantFile('some.xpi'), false);
    });

    it('ignores .git directories by default', () => {
      assert.equal(defaultFilter.wantFile('.git'), false);
    });

    it('ignores nested .git directories by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/.git'), false);
    });

    it('ignores any hidden file by default', () => {
      assert.equal(defaultFilter.wantFile('.whatever'), false);
    });

    it('ignores ZPI paths by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/some.zip'), false);
    });

    it('allows other files', () => {
      assert.equal(defaultFilter.wantFile('manifest.json'), true);
    });

    it('allows you to override the defaults', () => {
      const filter = new FileFilter({
        filesToIgnore: ['manifest.json'],
      });
      assert.equal(filter.wantFile('some.xpi'), true);
      assert.equal(filter.wantFile('manifest.json'), false);
    });

  });

});

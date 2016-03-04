/* @flow */
import {it, describe} from 'mocha';
import path from 'path';
import {assert} from 'chai';

import build, {prepareBuildDir, safeFileName} from '../../src/cmd/build';
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
          .then(() => {
            var fileNames = [];
            return new Promise((resolve, reject) => {
              zipFile.readEach((entry) => {
                fileNames.push(entry.fileName);
              })
              .then(() => {
                resolve(fileNames);
              })
              .catch((error) => {
                reject(error);
              });
            });
          })
          .then((fileNames) => {
            assert.deepEqual(fileNames, ['manifest.json']);
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

});

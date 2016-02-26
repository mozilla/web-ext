import path from 'path';
import {assert} from 'chai';

import {safeFileName} from '../../../src/cmd/build';
import {onlyInstancesOf, InvalidManifest} from '../../../src/errors';
import {withTempDir, ZipFile} from '../../helpers';
import * as fs from '../../../src/util/promised-fs';
import {getPackageBasename, prepareBuildDir} from '../../../src/cmd/build';

import * as adapter from './adapter';


describe('build', () => {

  describe('build', () => {

    it('zips a package', () => {
      let zipFile = new ZipFile();

      return withTempDir(
        (tmpDir) =>
          adapter.buildMinimalExt(tmpDir)
          .then((buildResult) => {
            assert.match(buildResult.extensionPath,
                         /minimal_extension-1\.0\.xpi$/);
            return buildResult.extensionPath;
          })
          .then((extensionPath) => zipFile.open(extensionPath))
          .then(() => {
            var fileNames = [];
            return new Promise((resolve) => {
              zipFile.readEach((entry) => {
                fileNames.push(entry.fileName);
              })
              .then(() => {
                resolve(fileNames);
              });
            });
          })
          .then((fileNames) => {
            assert.deepEqual(fileNames, ['manifest.json']);
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


  describe('getPackageBasename', () => {

    it('returns a base filename derived from a manifest', () => {
      return adapter.getMinimalExtBasename()
        .then((baseName) => {
          assert.equal(baseName, 'minimal_extension-1.0.xpi');
        });
    });

    it('reports a missing manifest.json file', () => withTempDir(
      (tmpDir) =>
        getPackageBasename(tmpDir.path())
        .catch(onlyInstancesOf(InvalidManifest, (error) => {
          assert.match(error.message, /Could not read manifest\.json/);
        }))
    ));

  });


  describe('safeFileName', () => {

    it('makes names safe for writing to a file system', () => {
      assert.equal(safeFileName('Bob Loblaw\'s 2005 law-blog.net'),
                   'bob_loblaw_s_2005_law-blog.net');
    });

  });

});

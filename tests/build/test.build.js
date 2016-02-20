import path from 'path';
import {assert} from 'chai';

import {withTempDir, ZipFile} from '../util';
import * as fs from '../../src/util/promised-fs';
import {prepareBuildDir} from '../../src/build';

import * as adapter from './adapter';


describe('build', () => {

  it('zips a package', () => {
    let zipFile = new ZipFile();

    return withTempDir(
      (tmpDir) =>
        adapter.buildMinimalExt(tmpDir)
        .then((buildResult) => zipFile.open(buildResult.xpiPath))
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


describe('build.prepareBuildDir', () => {

  it('creates a build dir if needed', () => {
    return withTempDir(
      (tmpDir) => {
        let buildDir = path.join(tmpDir.path(), 'build');
        return prepareBuildDir(buildDir)
          .then(() => {
            // This should not throw an error if created properly.
            return fs.stat(buildDir);
          });
      }
    );
  });

  it('ignores existing build dir', () => {
    return withTempDir(
      (tmpDir) =>
        prepareBuildDir(tmpDir.path())
        .then(() => {
          // Make sure everything is still cool with this path.
          return fs.stat(tmpDir.path());
        })
    );
  });

});

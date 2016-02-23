import path from 'path';
import {assert} from 'chai';

import {fixturePath, withTempDir, ZipFile} from '../util';
import * as fs from '../../src/util/promised-fs';
import build from '../../src/build';
import {prepareBuildDir} from '../../src/build';


describe('build', () => {

  it('zips a package', () => {
    let zipFile = new ZipFile();

    return withTempDir(
      (tmpDir) =>
        build({
          sourceDir: fixturePath('minimal-web-ext'),
          buildDir: tmpDir.path(),
        })
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

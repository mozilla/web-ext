import path from 'path';
import {assert} from 'chai';

import {fixturePath, TmpDir, ZipFile} from '../util';
import * as fs from '../../src/util/promised-fs';
import build from '../../src/build';
import {prepareBuildDir} from '../../src/build';


describe('build', () => {

  it('zips a package', () => {
    let tmpDir = new TmpDir();
    let zipFile = new ZipFile();

    return tmpDir.create()
      .then(() => build({
        sourceDir: fixturePath('minimal-web-ext'),
        buildDir: tmpDir.path(),
      }))
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
      .catch(tmpDir.errorHandler())
      .then(tmpDir.successHandler());
  });

});


describe('build.prepareBuildDir', () => {

  it('creates a build dir if needed', () => {
    let tmpDir = new TmpDir();

    return tmpDir.create()
      .then(() => {
        let buildDir = path.join(tmpDir.path(), 'build');
        return prepareBuildDir(buildDir)
          .then(() => {
            // This should not throw an error if created properly.
            return fs.stat(buildDir);
          });
      })
      .catch(tmpDir.errorHandler())
      .then(tmpDir.successHandler());
  });

  it('ignores existing build dir', () => {
    let tmpDir = new TmpDir();

    return tmpDir.create()
      .then(() => prepareBuildDir(tmpDir.path()))
      .then(() => {
        // Make sure everything is still cool with this path.
        return fs.stat(tmpDir.path());
      })
      .catch(tmpDir.errorHandler())
      .then(tmpDir.successHandler());
  });

});

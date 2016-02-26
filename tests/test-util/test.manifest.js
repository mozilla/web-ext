import path from 'path';
import {assert} from 'chai';

import {onlyInstancesOf, InvalidManifest} from '../../src/errors';
import * as fs from '../../src/util/promised-fs';
import getValidatedManifest from '../../src/util/manifest';
import {makeSureItFails, withTempDir} from '../helpers';


describe('util/manifest', () => {

  describe('getValidatedManifest', () => {

    it('returns a valid manifest', () => {
      let expectedData = {name: 'the extension', version: '0.0.1'};
      return withTempDir(
        (tmpDir) =>
          writeManifest(tmpDir.path(), expectedData)
          .then((manifestFile) => getValidatedManifest(manifestFile))
          .then((manifestData) => {
            assert.deepEqual(manifestData, expectedData);
          })
      );
    });

    it('reports an error for a missing manifest file', () => {
      let nonExistantFile = '/dev/null/nowhere/manifest.json';
      return getValidatedManifest(nonExistantFile)
        .then(makeSureItFails())
        .catch(onlyInstancesOf(InvalidManifest, (error) => {
          assert.match(error.message, /Could not read manifest\.json/);
          // Make sure the filename is included in the exception message.
          // This is actually done by default in file system error messages.
          assert.include(error.message, nonExistantFile);
        }));
    });

    it('reports an error for invalid manifest JSON', () => withTempDir(
      (tmpDir) => {
        let badManifest = `{
          "name": "I'm an invalid JSON Manifest
          "version": "0.0.0"
        }`;
        let manifestFile = path.join(tmpDir.path(), 'manifest.json');
        return fs.writeFile(manifestFile, badManifest)
          .then(() => getValidatedManifest(manifestFile))
          .then(makeSureItFails())
          .catch(onlyInstancesOf(InvalidManifest, (error) => {
            assert.match(error.message, /Error parsing manifest\.json/);
            assert.include(error.message, manifestFile);
          }));
      }
    ));

    it('reports an error for a manifest without a name', () => withTempDir(
      (tmpDir) =>
        writeManifest(tmpDir.path(), {version: '0.0.1'})
        .then((manifestFile) => {
          return getValidatedManifest(manifestFile)
            .then(makeSureItFails())
            .catch(onlyInstancesOf(InvalidManifest, (error) => {
              assert.match(
                error.message,
                /Manifest at .* is invalid: missing "name" property/);
              assert.include(error.message, manifestFile);
            }));
        })
    ));

    it('reports an error for a manifest without a version', () => withTempDir(
      (tmpDir) =>
        writeManifest(tmpDir.path(), {name: 'the extension'})
        .then((manifestFile) => {
          return getValidatedManifest(manifestFile)
            .then(makeSureItFails())
            .catch(onlyInstancesOf(InvalidManifest, (error) => {
              assert.match(
                error.message,
                /Manifest at .* is invalid: missing "version" property/);
              assert.include(error.message, manifestFile);
            }));
        })
    ));

    it('reports all errors', () => withTempDir(
      (tmpDir) =>
        writeManifest(tmpDir.path(), {}) // empty manifest
        .then((manifestFile) => {
          return getValidatedManifest(manifestFile)
            .then(makeSureItFails())
            .catch(onlyInstancesOf(InvalidManifest, (error) => {
              assert.match(
                error.message,
                /missing "name" property; missing "version" property/);
            }));
        })
    ));

  });

});


function writeManifest(destDir, manifestData) {
  let manifestFile = path.join(destDir, 'manifest.json');
  return fs.writeFile(manifestFile, JSON.stringify(manifestData))
    .then(() => manifestFile);
}

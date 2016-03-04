/* @flow */
import {describe, it} from 'mocha';
import path from 'path';
import {assert} from 'chai';
import deepcopy from 'deepcopy';

import {onlyInstancesOf, InvalidManifest} from '../../src/errors';
import fs from 'mz/fs';
import getValidatedManifest from '../../src/util/manifest';
import {withTempDir} from '../../src/util/temp-dir';
import {makeSureItFails} from '../helpers';


export const basicManifest = {
  name: 'the extension',
  version: '0.0.1',
  applications: {
    gecko: {
      id: 'basic-manifest@web-ext-test-suite',
    },
  },
};


describe('util/manifest', () => {

  describe('getValidatedManifest', () => {

    it('returns a valid manifest', () => withTempDir(
      (tmpDir) =>
        writeManifest(tmpDir.path(), basicManifest)
        .then(() => getValidatedManifest(tmpDir.path()))
        .then((manifestData) => {
          assert.deepEqual(manifestData, basicManifest);
        })
    ));

    it('reports an error for a missing manifest file', () => {
      let nonExistentDir = '/dev/null/nowhere/';
      return getValidatedManifest(nonExistentDir)
        .then(makeSureItFails())
        .catch(onlyInstancesOf(InvalidManifest, (error) => {
          assert.match(error.message, /Could not read manifest\.json/);
          // Make sure the filename is included in the exception message.
          // This is actually done by default in file system error messages.
          assert.include(error.message, nonExistentDir);
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
          .then(() => getValidatedManifest(tmpDir.path()))
          .then(makeSureItFails())
          .catch(onlyInstancesOf(InvalidManifest, (error) => {
            assert.match(error.message, /Error parsing manifest\.json/);
            assert.include(error.message, manifestFile);
          }));
      }
    ));

    it('reports an error when missing a name', () => withTempDir(
      (tmpDir) => {
        let noNameManifest = deepcopy(basicManifest);
        delete noNameManifest.name;

        return writeManifest(tmpDir.path(), noNameManifest)
          .then((manifestFile) => {
            return getValidatedManifest(tmpDir.path())
              .then(makeSureItFails())
              .catch(onlyInstancesOf(InvalidManifest, (error) => {
                assert.match(
                  error.message,
                  /Manifest at .* is invalid: missing "name" property/);
                assert.include(error.message, manifestFile);
              }));
          });
      }
    ));

    it('reports an error when missing version', () => withTempDir(
      (tmpDir) => {
        let noVersionManifest = deepcopy(basicManifest);
        delete noVersionManifest.version;

        return writeManifest(tmpDir.path(), noVersionManifest)
          .then((manifestFile) => {
            return getValidatedManifest(tmpDir.path())
              .then(makeSureItFails())
              .catch(onlyInstancesOf(InvalidManifest, (error) => {
                assert.match(
                  error.message,
                  /Manifest at .* is invalid: missing "version" property/);
                assert.include(error.message, manifestFile);
              }));
          });
      }
    ));

    it('reports an error when missing applications', () => withTempDir(
      (tmpDir) => {
        let incompleteManifest = deepcopy(basicManifest);
        delete incompleteManifest.applications;

        return writeManifest(tmpDir.path(), incompleteManifest)
          .then((manifestFile) => {
            return getValidatedManifest(tmpDir.path())
              .then(makeSureItFails())
              .catch(onlyInstancesOf(InvalidManifest, (error) => {
                assert.match(
                  error.message,
                  /Manifest at .* is invalid: missing "applications" property/);
                assert.include(error.message, manifestFile);
              }));
          });
      }
    ));

    it('reports an error when missing applications.gecko', () => withTempDir(
      (tmpDir) => {
        let incompleteManifest = deepcopy(basicManifest);
        delete incompleteManifest.applications.gecko;

        return writeManifest(tmpDir.path(), incompleteManifest)
          .then((manifestFile) => {
            return getValidatedManifest(tmpDir.path())
              .then(makeSureItFails())
              .catch(onlyInstancesOf(InvalidManifest, (error) => {
                assert.match(
                  error.message,
                  /Manifest at .* is invalid: missing "applications.gecko".*/);
                assert.include(error.message, manifestFile);
              }));
          });
      }
    ));

    it('reports an error when missing applications.gecko.id', () => withTempDir(
      (tmpDir) => {
        let incompleteManifest = deepcopy(basicManifest);
        delete incompleteManifest.applications.gecko.id;

        return writeManifest(tmpDir.path(), incompleteManifest)
          .then((manifestFile) => {
            return getValidatedManifest(tmpDir.path())
              .then(makeSureItFails())
              .catch(onlyInstancesOf(InvalidManifest, (error) => {
                assert.match(
                  error.message,
                  /Manifest .* is invalid: missing "applications.gecko.id".*/);
                assert.include(error.message, manifestFile);
              }));
          });
      }
    ));

    it('concatenates errors in error message', () => withTempDir(
      (tmpDir) => {
        let manifestWithErrors = deepcopy(basicManifest);
        delete manifestWithErrors.name;
        delete manifestWithErrors.version;

        return writeManifest(tmpDir.path(), manifestWithErrors)
          .then(() => {
            return getValidatedManifest(tmpDir.path())
              .then(makeSureItFails())
              .catch(onlyInstancesOf(InvalidManifest, (error) => {
                assert.match(
                  error.message,
                  /missing "name" property; missing "version" property/);
              }));
          });
      }
    ));

  });

});


function writeManifest(destDir, manifestData) {
  let manifestFile = path.join(destDir, 'manifest.json');
  return fs.writeFile(manifestFile, JSON.stringify(manifestData))
    .then(() => manifestFile);
}

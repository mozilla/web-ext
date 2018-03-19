/* @flow */
import path from 'path';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import deepcopy from 'deepcopy';
import {fs} from 'mz';

import {onlyInstancesOf, InvalidManifest} from '../../../src/errors';
import getValidatedManifest, {getManifestId} from '../../../src/util/manifest';
import {withTempDir} from '../../../src/util/temp-dir';
import {basicManifest, makeSureItFails} from '../helpers';


export const manifestWithoutApps = deepcopy(basicManifest);
delete manifestWithoutApps.applications;


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

    it('allows manifests without an applications property', () => withTempDir(
      (tmpDir) =>
        writeManifest(tmpDir.path(), manifestWithoutApps)
          .then(() => getValidatedManifest(tmpDir.path()))
          .then((manifestData) => {
            assert.deepEqual(manifestData, manifestWithoutApps);
          })
    ));

    it('reports an error for a missing manifest file', () => {
      const nonExistentDir = path.join('dev', 'null', 'nowhere');
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
        const badManifest = `{
          "name": "I'm an invalid JSON Manifest
          "version": "0.0.0"
        }`;
        const manifestFile = path.join(tmpDir.path(), 'manifest.json');
        return fs.writeFile(manifestFile, badManifest)
          .then(() => getValidatedManifest(tmpDir.path()))
          .then(makeSureItFails())
          .catch(onlyInstancesOf(InvalidManifest, (error) => {
            assert.match(error.message, /Error parsing manifest\.json at /);
            assert.include(
              error.message, 'Unexpected token  in JSON at position 49');
            assert.include(error.message, manifestFile);
          }));
      }
    ));

    it('reports an error when missing a name', () => withTempDir(
      (tmpDir) => {
        const noNameManifest = deepcopy(basicManifest);
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
        const noVersionManifest = deepcopy(basicManifest);
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

    it('reports an error when missing applications.gecko', () => withTempDir(
      (tmpDir) => {
        const incompleteManifest = deepcopy(basicManifest);
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

    it('allows a missing applications.gecko.id', () => withTempDir(
      (tmpDir) => {
        const incompleteManifest = deepcopy(basicManifest);
        delete incompleteManifest.applications.gecko.id;

        return writeManifest(tmpDir.path(), incompleteManifest)
          .then(() => getValidatedManifest(tmpDir.path()))
          .then((manifestData) => {
            assert.strictEqual(getManifestId(manifestData), undefined);
          });
      }
    ));

    it('concatenates errors in error message', () => withTempDir(
      (tmpDir) => {
        const manifestWithErrors = deepcopy(basicManifest);
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

    it('allows comments in manifest JSON', () =>
      withTempDir(async (tmpDir) => {
        const manifestWithComments = `{
          "name": "the extension",
          "version": "0.0.1" // comments
        }`;
        const manifestFile = path.join(tmpDir.path(), 'manifest.json');
        await fs.writeFile(manifestFile, manifestWithComments);
        const manifestData = await getValidatedManifest(tmpDir.path());

        assert.deepEqual(manifestData, manifestWithoutApps);
      })
    );

    it('reports an error with line number in manifest JSON with comments', () =>
      withTempDir(async (tmpDir) => {
        const invalidManifestWithComments = `{
          // a comment in its own line
          // another comment on its own line
          "name": "I'm an invalid JSON Manifest
        }`;
        const manifestFile = path.join(tmpDir.path(), 'manifest.json');
        await fs.writeFile(manifestFile, invalidManifestWithComments);
        const promise = getValidatedManifest(tmpDir.path());

        const error = await assert.isRejected(promise, InvalidManifest);
        await assert.isRejected(promise, /Error parsing manifest\.json at /);
        assert.include(error.message, 'in JSON at position 133');
        assert.include(error.message, manifestFile);
      })
    );

  });

  describe('getManifestId', () => {

    it('returns a gecko ID', () => {
      assert.equal(getManifestId(basicManifest),
                   'basic-manifest@web-ext-test-suite');
    });

    it('returns undefined when ID is not specified', () => {
      assert.strictEqual(getManifestId(manifestWithoutApps), undefined);
    });

  });

});


function writeManifest(destDir, manifestData) {
  const manifestFile = path.join(destDir, 'manifest.json');
  return fs.writeFile(manifestFile, JSON.stringify(manifestData))
    .then(() => manifestFile);
}

/* @flow */
import path from 'path';

import copyDir from 'copy-dir';
import {fs} from 'mz';
import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';
import promisify from 'es6-promisify';

import {onlyInstancesOf, UsageError, WebExtError} from '../../../src/errors';
import {getManifestId} from '../../../src/util/manifest';
import {withTempDir} from '../../../src/util/temp-dir';
import {manifestWithoutApps} from '../test-util/test.manifest';
import completeSignCommand, {
  extensionIdFile, getIdFromSourceDir, saveIdToSourceDir,
} from '../../../src/cmd/sign';
import {
  basicManifest,
  makeSureItFails,
  fixturePath,
} from '../helpers';
// Import flow type
import type {ExtensionManifestApplications} from '../../../src/util/manifest';

describe('sign', () => {

  function getStubs() {
    const signingConfig = {
      apiKey: 'AMO JWT issuer',
      apiSecret: 'AMO JWT secret',
      apiUrlPrefix: 'http://not-the-real-amo.com/api/v3',
      apiProxy: 'http://yourproxy:6000',
      timeout: 999,
    };

    const buildResult = {
      extensionPath: '/tmp/built-web-extension.xpi',
    };
    const build = sinon.spy(() => Promise.resolve(buildResult));

    const signingResult = {
      id: 'some-addon-id',
      success: true,
      downloadedFiles: [],
    };
    const signAddon = sinon.spy(() => Promise.resolve(signingResult));

    return {
      signingConfig,
      build,
      buildResult,
      signAddon,
      signingResult,
      preValidatedManifest: basicManifest,
    };
  }

  /*
   * Run the sign command with stubs for all dependencies.
   */
  function sign(
    tmpDir: Object, stubs: Object,
    {extraArgs = {}, extraOptions = {}}: Object = {}
  ): Promise<*> {
    return completeSignCommand({
      verbose: false,
      artifactsDir: path.join(tmpDir.path(), 'artifacts-dir'),
      sourceDir: tmpDir.path(),
      ...stubs.signingConfig,
      ...extraArgs,
    }, {
      ...stubs,
      ...extraOptions,
    });
  }

  it('builds and signs an extension', () => withTempDir(
    // This test only stubs out the signer in an effort to integrate
    // all other parts of the process.
    (tmpDir) => {
      const stubs = getStubs();
      const sourceDir = path.join(tmpDir.path(), 'source-dir');
      const copyDirAsPromised = promisify(copyDir);
      return copyDirAsPromised(fixturePath('minimal-web-ext'), sourceDir)
        .then(() => completeSignCommand({
          sourceDir,
          artifactsDir: path.join(tmpDir.path(), 'artifacts'),
          ...stubs.signingConfig,
        }, {
          signAddon: stubs.signAddon,
        }))
        .then((result) => {
          assert.equal(result.success, true);
          // Do a sanity check that a built extension was passed to the
          // signer.
          assert.include(stubs.signAddon.firstCall.args[0].xpiPath,
                         'minimal_extension-1.0.zip');
        });
    }
  ));

  it('allows an empty application ID when signing', () => withTempDir(
    (tmpDir) => {
      const stubs = getStubs();
      return sign(
        tmpDir, stubs,
        {
          extraOptions: {
            preValidatedManifest: manifestWithoutApps,
          },
        })
        .then(() => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(
            stubs.signAddon,
            {id: getManifestId(manifestWithoutApps)}
          );
        });
    }
  ));

  it('allows a custom ID when no ID in manifest.json', () => withTempDir(
    (tmpDir) => {
      const customId = 'some-custom-id';
      const stubs = getStubs();
      return sign(
        tmpDir, stubs,
        {
          extraArgs: {
            id: customId,
          },
          extraOptions: {
            preValidatedManifest: manifestWithoutApps,
          },
        })
        .then(() => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(stubs.signAddon, {id: customId});
        });
    }
  ));

  it('prefers a custom ID over an ID file', () => withTempDir(
    (tmpDir) => {
      const sourceDir = path.join(tmpDir.path(), 'source-dir');
      const customId = 'some-custom-id';
      const stubs = getStubs();
      // First, save an extension ID like a previous signing call.
      return fs.mkdir(sourceDir)
        .then(() => saveIdToSourceDir(sourceDir, 'some-other-id'))
        // Now, make a signing call with a custom ID.
        .then(() => sign(tmpDir, stubs, {
          extraArgs: {
            sourceDir,
            id: customId,
          },
          extraOptions: {
            preValidatedManifest: manifestWithoutApps,
          },
        }))
        .then(() => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(stubs.signAddon, {id: customId});
        });
    }
  ));

  it('disallows a custom ID when manifest.json has ID', () => withTempDir(
    (tmpDir) => {
      const customId = 'some-custom-id';
      const stubs = getStubs();
      return sign(
        tmpDir, stubs,
        {
          extraArgs: {
            id: customId,
          },
          extraOptions: {
            // This manifest has an ID in it.
            preValidatedManifest: basicManifest,
          },
        })
        .then(makeSureItFails())
        .catch(onlyInstancesOf(UsageError, (error) => {
          assert.match(error.message, /Cannot set custom ID some-custom-id/);
          assert.match(
            error.message,
            /manifest\.json declares ID basic-manifest@web-ext-test-suite/);
        }));
    }
  ));

  it('remembers auto-generated IDs for successive signing', () => withTempDir(
    (tmpDir) => {

      function _sign() {
        const signAddon = sinon.spy(() => Promise.resolve({
          ...stubs.signingResult,
          id: 'auto-generated-id',
        }));

        return sign(
          tmpDir,
          {
            ...stubs,
            signAddon,
          }, {
            extraOptions: {
              preValidatedManifest: manifestWithoutApps,
            },
          })
          .then((signingResult) => {
            return {signingResult, signAddon};
          });
      }

      const stubs = getStubs();

      // Run an initial sign command which will yield a server generated ID.
      return _sign()
        .then(({signAddon, signingResult}) => {
          sinon.assert.called(signAddon);
          sinon.assert.calledWithMatch(signAddon, {id: undefined});
          assert.equal(signingResult.id, 'auto-generated-id');

          // Re-run the sign command again.
          return _sign();
        })
        .then(({signAddon}) => {
          sinon.assert.called(signAddon);
          // This should call signAddon() with the server generated
          // ID that was saved to the source directory from the previous
          // signing result.
          sinon.assert.calledWithMatch(signAddon, {id: 'auto-generated-id'});
        });
    }
  ));

  it('returns a signing result', () => withTempDir(
    (tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs)
        .then((realResult) => {
          assert.deepEqual(realResult, stubs.signingResult);
        });
    }
  ));

  it('might fail', () => withTempDir(
    (tmpDir) => {
      return sign(
        tmpDir, {
          ...getStubs(),
          signAddon: () => Promise.resolve({
            success: false,
          }),
        })
        .then(makeSureItFails())
        .catch((error) => {
          assert.instanceOf(error, WebExtError);
          assert.match(error.message, /The extension could not be signed/);
        });
    }
  ));

  it('calls the add-on signer', () => withTempDir(
    (tmpDir) => {
      const stubs = getStubs();
      const artifactsDir = path.join(tmpDir.path(), 'some-artifacts-dir');
      const applications: ExtensionManifestApplications =
        stubs.preValidatedManifest.applications || {gecko: {}};
      return sign(tmpDir, stubs, {extraArgs: {artifactsDir}})
        .then(() => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(stubs.signAddon, {
            apiKey: stubs.signingConfig.apiKey,
            apiProxy: stubs.signingConfig.apiProxy,
            apiSecret: stubs.signingConfig.apiSecret,
            apiUrlPrefix: stubs.signingConfig.apiUrlPrefix,
            downloadDir: artifactsDir,
            id: applications.gecko.id,
            timeout: stubs.signingConfig.timeout,
            version: stubs.preValidatedManifest.version,
            xpiPath: stubs.buildResult.extensionPath,
          });
        });
    }
  ));

  it('passes the channel parameter to the signer', () => withTempDir(
    (tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs, {extraArgs: {channel: 'unlisted'}})
        .then(() => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(stubs.signAddon, {channel: 'unlisted'});
        });
    }
  ));

  it('passes the verbose flag to the signer', () => withTempDir(
    (tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs, {extraArgs: {verbose: true}})
        .then(() => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(stubs.signAddon, {verbose: true});
        });
    }
  ));

  it('passes the ignoreFiles flag to the builder', () => withTempDir(
    (tmpDir) => {
      const stubs = getStubs();
      const ignoreFiles = ['*'];
      return sign(tmpDir, stubs, {extraArgs: {ignoreFiles}})
        .then(() => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(stubs.build, {ignoreFiles});
        });
    }
  ));

  it('passes through a signing exception', () => withTempDir(
    (tmpDir) => {
      const stubs = getStubs();
      stubs.signAddon = () => Promise.reject(new Error('some signing error'));

      return sign(tmpDir, stubs)
        .then(makeSureItFails())
        .catch((error) => {
          assert.match(error.message, /signing error/);
        });
    }
  ));

  describe('saveIdToSourceDir', () => {

    it('saves an extension ID to file', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        return saveIdToSourceDir(sourceDir, 'some-id')
          .then(() => fs.readFile(path.join(sourceDir, extensionIdFile)))
          .then((content) => {
            assert.include(content.toString(), 'some-id');
          });
      }
    ));

    it('will overwrite an existing file', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        return saveIdToSourceDir(sourceDir, 'first-id')
          .then(() => saveIdToSourceDir(sourceDir, 'second-id'))
          .then(() => getIdFromSourceDir(sourceDir))
          .then((savedId) => {
            assert.equal(savedId, 'second-id');
          });
      }
    ));

  });

  describe('getIdFromSourceDir', () => {

    it('gets a saved extension ID', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        return saveIdToSourceDir(sourceDir, 'some-id')
          .then(() => getIdFromSourceDir(sourceDir))
          .then((extensionId) => {
            assert.equal(extensionId, 'some-id');
          });
      }
    ));

    it('throws an error for empty files', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        return fs.writeFile(path.join(sourceDir, extensionIdFile), '')
          .then(() => getIdFromSourceDir(sourceDir))
          .then(makeSureItFails())
          .catch(onlyInstancesOf(UsageError, (error) => {
            assert.match(error.message, /No ID found in extension ID file/);
          }));
      }
    ));

    it('returns empty ID when extension file does not exist', () => withTempDir(
      (tmpDir) => {
        const sourceDir = tmpDir.path();
        return getIdFromSourceDir(sourceDir)
          .then((savedId) => {
            assert.strictEqual(savedId, undefined);
          });
      }
    ));

  });

});

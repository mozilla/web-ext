import path from 'path';
import { promisify } from 'util';

import copyDir from 'copy-dir';
import { fs } from 'mz';
import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { UsageError, WebExtError } from '../../../src/errors.js';
import { AMO_BASE_URL } from '../../../src/program.js';
import { getManifestId } from '../../../src/util/manifest.js';
import { saveIdToFile } from '../../../src/util/submit-addon.js';
import { withTempDir } from '../../../src/util/temp-dir.js';
import completeSignCommand, {
  extensionIdFile,
  getIdFromFile,
} from '../../../src/cmd/sign.js';
import { basicManifest, manifestWithoutApps, fixturePath } from '../helpers.js';

describe('sign', () => {
  function getStubs() {
    const signingConfig = {
      amoBaseUrl: AMO_BASE_URL,
      apiKey: 'AMO JWT issuer',
      apiSecret: 'AMO JWT secret',
      apiUrlPrefix: 'http://not-the-real-amo.com/api/v4',
      timeout: 999,
      webextVersion: '12.34',
    };

    const buildResult = {
      extensionPath: '/tmp/built-web-extension.xpi',
    };
    const build = sinon.spy(() => Promise.resolve(buildResult));

    const signingResult = {
      id: 'some-addon-id',
      downloadedFiles: [],
    };
    const signAddonResult = { ...signingResult, success: true };
    const submitAddonResult = { ...signingResult };
    const signAddon = sinon.spy(() => Promise.resolve(signAddonResult));
    const submitAddon = sinon.spy(() => Promise.resolve(submitAddonResult));

    return {
      signingConfig,
      build,
      buildResult,
      signAddon,
      submitAddon,
      signAddonResult,
      submitAddonResult,
      signingResult,
      preValidatedManifest: basicManifest,
    };
  }

  /*
   * Run the sign command with stubs for all dependencies.
   */
  function sign(tmpDir, stubs, { extraArgs = {}, extraOptions = {} } = {}) {
    return completeSignCommand(
      {
        verbose: false,
        artifactsDir: path.join(tmpDir.path(), 'artifacts-dir'),
        sourceDir: tmpDir.path(),
        ...stubs.signingConfig,
        ...extraArgs,
      },
      {
        ...stubs,
        ...extraOptions,
      }
    );
  }

  it('builds and signs an extension', () =>
    withTempDir(
      // This test only stubs out the signer in an effort to integrate
      // all other parts of the process.
      (tmpDir) => {
        const stubs = getStubs();
        const sourceDir = path.join(tmpDir.path(), 'source-dir');
        const copyDirAsPromised = promisify(copyDir);
        return copyDirAsPromised(fixturePath('minimal-web-ext'), sourceDir)
          .then(() =>
            completeSignCommand(
              {
                sourceDir,
                artifactsDir: path.join(tmpDir.path(), 'artifacts'),
                apiProxy: 'http://yourproxy:6000',
                ...stubs.signingConfig,
              },
              {
                signAddon: stubs.signAddon,
              }
            )
          )
          .then((result) => {
            assert.equal(result.id, stubs.signingResult.id);
            // Do a sanity check that a built extension was passed to the
            // signer.
            assert.include(
              stubs.signAddon.firstCall.args[0].xpiPath,
              'minimal_extension-1.0.zip'
            );
          });
      }
    ));

  it('builds and signs an extension with submission api', () =>
    withTempDir(
      // This test only stubs out the signer in an effort to integrate
      // all other parts of the process.
      (tmpDir) => {
        const stubs = getStubs();
        const sourceDir = path.join(tmpDir.path(), 'source-dir');
        const copyDirAsPromised = promisify(copyDir);
        return copyDirAsPromised(fixturePath('minimal-web-ext'), sourceDir)
          .then(() =>
            completeSignCommand(
              {
                sourceDir,
                artifactsDir: path.join(tmpDir.path(), 'artifacts'),
                ...stubs.signingConfig,
                useSubmissionApi: true,
                channel: 'listed',
              },
              {
                submitAddon: stubs.submitAddon,
              }
            )
          )
          .then((result) => {
            assert.equal(result.id, stubs.signingResult.id);
            // Do a sanity check that a built extension was passed to the
            // signer.
            const submitAddonCall = stubs.submitAddon.firstCall.args[0];
            assert.include(
              submitAddonCall.xpiPath,
              'minimal_extension-1.0.zip'
            );
            assert.include(
              submitAddonCall.amoBaseUrl,
              stubs.signingConfig.amoBaseUrl
            );
          });
      }
    ));

  it('allows an empty application ID when signing', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs, {
        extraOptions: {
          preValidatedManifest: manifestWithoutApps,
        },
      }).then(() => {
        sinon.assert.called(stubs.signAddon);
        sinon.assert.calledWithMatch(stubs.signAddon, {
          id: getManifestId(manifestWithoutApps),
        });
      });
    }));

  it('allows a custom ID when no ID in manifest.json', () =>
    withTempDir((tmpDir) => {
      const customId = 'some-custom-id';
      const stubs = getStubs();
      return sign(tmpDir, stubs, {
        extraArgs: {
          id: customId,
        },
        extraOptions: {
          preValidatedManifest: manifestWithoutApps,
        },
      }).then(() => {
        sinon.assert.called(stubs.signAddon);
        sinon.assert.calledWithMatch(stubs.signAddon, { id: customId });
      });
    }));

  it("doesn't allow a custom ID when no ID in manifest.json with submission api", () =>
    withTempDir(async (tmpDir) => {
      const customId = 'some-custom-id';
      const stubs = getStubs();
      const promiseSigned = sign(tmpDir, stubs, {
        extraArgs: {
          id: customId,
          useSubmissionApi: true,
        },
        extraOptions: {
          preValidatedManifest: manifestWithoutApps,
        },
      });
      await assert.isRejected(promiseSigned, UsageError);
      await assert.isRejected(
        promiseSigned,
        /Cannot set custom ID some-custom-id/
      );
      await assert.isRejected(
        promiseSigned,
        /requires a custom ID be specified in the manifest/
      );
    }));

  it("doesn't allow ID file when no ID in manifest.json with submission api", () =>
    withTempDir(async (tmpDir) => {
      const sourceDir = path.join(tmpDir.path(), 'source-dir');
      const idFile = path.join(sourceDir, extensionIdFile);
      const stubs = getStubs();
      await fs.mkdir(sourceDir);
      await saveIdToFile(idFile, 'some-other-id');
      // Now, make a signing call with a custom ID.
      const promiseSigned = sign(tmpDir, stubs, {
        extraArgs: {
          useSubmissionApi: true,
          channel: 'listed',
          sourceDir,
        },
        extraOptions: {
          preValidatedManifest: manifestWithoutApps,
        },
      });

      await assert.isRejected(promiseSigned, UsageError);
      await assert.isRejected(
        promiseSigned,
        /Cannot use previously auto-generated extension ID/
      );
      await assert.isRejected(promiseSigned, /some-other-id - /);
      await assert.isRejected(
        promiseSigned,
        /requires a custom ID be specified in the manifest/
      );
    }));

  it('prefers a custom ID over an ID file', () =>
    withTempDir((tmpDir) => {
      const sourceDir = path.join(tmpDir.path(), 'source-dir');
      const idFile = path.join(sourceDir, extensionIdFile);
      const customId = 'some-custom-id';
      const stubs = getStubs();
      // First, save an extension ID like a previous signing call.
      return (
        fs
          .mkdir(sourceDir)
          .then(() => saveIdToFile(idFile, 'some-other-id'))
          // Now, make a signing call with a custom ID.
          .then(() =>
            sign(tmpDir, stubs, {
              extraArgs: {
                sourceDir,
                id: customId,
              },
              extraOptions: {
                preValidatedManifest: manifestWithoutApps,
              },
            })
          )
          .then(() => {
            sinon.assert.called(stubs.signAddon);
            sinon.assert.calledWithMatch(stubs.signAddon, { id: customId });
          })
      );
    }));

  it('disallows a custom ID when manifest.json has ID', () =>
    withTempDir(async (tmpDir) => {
      const customId = 'some-custom-id';
      const stubs = getStubs();
      const signPromise = sign(tmpDir, stubs, {
        extraArgs: {
          id: customId,
        },
        extraOptions: {
          // This manifest has an ID in it.
          preValidatedManifest: basicManifest,
        },
      });
      await assert.isRejected(signPromise, UsageError);
      await assert.isRejected(
        signPromise,
        /Cannot set custom ID some-custom-id/
      );
      await assert.isRejected(
        signPromise,
        /manifest\.json declares ID basic-manifest@web-ext-test-suite/
      );
    }));

  it('remembers auto-generated IDs for successive signing', () =>
    withTempDir((tmpDir) => {
      function _sign() {
        const signAddon = sinon.spy(() =>
          Promise.resolve({
            ...stubs.signAddonResult,
            id: 'auto-generated-id',
          })
        );

        return sign(
          tmpDir,
          {
            ...stubs,
            signAddon,
          },
          {
            extraOptions: {
              preValidatedManifest: manifestWithoutApps,
            },
          }
        ).then((signingResult) => {
          return { signingResult, signAddon };
        });
      }

      const stubs = getStubs();

      // Run an initial sign command which will yield a server generated ID.
      return _sign()
        .then(({ signAddon, signingResult }) => {
          sinon.assert.called(signAddon);
          sinon.assert.calledWithMatch(signAddon, { id: undefined });
          assert.equal(signingResult.id, 'auto-generated-id');

          // Re-run the sign command again.
          return _sign();
        })
        .then(({ signAddon }) => {
          sinon.assert.called(signAddon);
          // This should call signAddon() with the server generated
          // ID that was saved to the source directory from the previous
          // signing result.
          sinon.assert.calledWithMatch(signAddon, { id: 'auto-generated-id' });
        });
    }));

  it('requires a channel for submission API', () =>
    withTempDir(async (tmpDir) => {
      const stubs = getStubs();
      const signPromise = sign(tmpDir, stubs, {
        extraArgs: {
          useSubmissionApi: true,
        },
        extraOptions: {
          preValidatedManifest: manifestWithoutApps,
        },
      });
      await assert.isRejected(signPromise, UsageError);
      await assert.isRejected(
        signPromise,
        /channel is a required parameter for the addon submission API/
      );
    }));

  it('does not support apiProxy with submission API', () =>
    withTempDir(async (tmpDir) => {
      const stubs = getStubs();
      const signPromise = sign(tmpDir, stubs, {
        extraArgs: {
          useSubmissionApi: true,
          apiProxy: 'http://yourproxy:6000',
          channel: 'listed',
        },
        extraOptions: {
          preValidatedManifest: manifestWithoutApps,
        },
      });
      await assert.isRejected(signPromise, UsageError);
      await assert.isRejected(
        signPromise,
        /apiProxy isn't yet supported for the addon submission API/
      );
    }));

  it('returns a signing result', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs).then((realResult) => {
        assert.deepEqual(realResult, stubs.signingResult);
      });
    }));

  it('might fail', () =>
    withTempDir(async (tmpDir) => {
      const signPromise = sign(tmpDir, {
        ...getStubs(),
        signAddon: () =>
          Promise.resolve({
            success: false,
          }),
      });
      await assert.isRejected(signPromise, WebExtError);
      await assert.isRejected(signPromise, /The extension could not be signed/);
    }));

  it('calls the add-on signer', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      const artifactsDir = path.join(tmpDir.path(), 'some-artifacts-dir');
      const apiProxy = 'http://yourproxy:6000';
      const applications = stubs.preValidatedManifest.applications || {
        gecko: {},
      };
      const userAgentString = `web-ext/${stubs.signingConfig.webextVersion}`;
      const apiRequestConfig = { headers: { 'User-Agent': userAgentString } };
      return sign(tmpDir, stubs, {
        extraArgs: { artifactsDir, apiProxy },
      }).then(() => {
        sinon.assert.called(stubs.signAddon);
        sinon.assert.calledWithMatch(stubs.signAddon, {
          apiKey: stubs.signingConfig.apiKey,
          apiProxy,
          apiSecret: stubs.signingConfig.apiSecret,
          apiUrlPrefix: stubs.signingConfig.apiUrlPrefix,
          downloadDir: artifactsDir,
          id: applications.gecko?.id,
          timeout: stubs.signingConfig.timeout,
          version: stubs.preValidatedManifest.version,
          xpiPath: stubs.buildResult.extensionPath,
          apiRequestConfig,
        });
      });
    }));

  it('calls the add-on submission api signer', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      const artifactsDir = path.join(tmpDir.path(), 'some-artifacts-dir');
      const applications = stubs.preValidatedManifest.applications || {
        gecko: {},
      };
      const userAgentString = `web-ext/${stubs.signingConfig.webextVersion}`;
      const channel = 'unlisted';
      return sign(tmpDir, stubs, {
        extraArgs: { artifactsDir, useSubmissionApi: true, channel },
      }).then(() => {
        sinon.assert.called(stubs.submitAddon);
        sinon.assert.calledWithMatch(stubs.submitAddon, {
          apiKey: stubs.signingConfig.apiKey,
          apiSecret: stubs.signingConfig.apiSecret,
          amoBaseUrl: stubs.signingConfig.amoBaseUrl,
          downloadDir: artifactsDir,
          id: applications.gecko?.id,
          timeout: stubs.signingConfig.timeout,
          xpiPath: stubs.buildResult.extensionPath,
          channel,
          userAgentString,
        });
      });
    }));

  it('passes the channel parameter to the signer', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs, { extraArgs: { channel: 'unlisted' } }).then(
        () => {
          sinon.assert.called(stubs.signAddon);
          sinon.assert.calledWithMatch(stubs.signAddon, {
            channel: 'unlisted',
          });
        }
      );
    }));

  it('passes the verbose flag to the signer', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs, { extraArgs: { verbose: true } }).then(() => {
        sinon.assert.called(stubs.signAddon);
        sinon.assert.calledWithMatch(stubs.signAddon, { verbose: true });
      });
    }));

  it('passes the disableProgressBar flag to the signer', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      return sign(tmpDir, stubs, {
        extraArgs: { disableProgressBar: true },
      }).then(() => {
        sinon.assert.called(stubs.signAddon);
        sinon.assert.calledWithMatch(stubs.signAddon, {
          disableProgressBar: true,
        });
      });
    }));

  it('passes the ignoreFiles flag to the builder', () =>
    withTempDir((tmpDir) => {
      const stubs = getStubs();
      const ignoreFiles = ['*'];
      return sign(tmpDir, stubs, { extraArgs: { ignoreFiles } }).then(() => {
        sinon.assert.called(stubs.signAddon);
        sinon.assert.calledWithMatch(stubs.build, { ignoreFiles });
      });
    }));

  it('passes through a signing exception', () =>
    withTempDir(async (tmpDir) => {
      const stubs = getStubs();
      stubs.signAddon = () => Promise.reject(new Error('some signing error'));

      const signPromise = sign(tmpDir, stubs);
      await assert.isRejected(signPromise, /signing error/);
    }));

  it('passes through a signing exception from submitAddon', () =>
    withTempDir(async (tmpDir) => {
      const stubs = getStubs();
      stubs.submitAddon = () => Promise.reject(new Error('some signing error'));

      const signPromise = sign(tmpDir, stubs, {
        extraArgs: { useSubmissionApi: true, channel: 'listed' },
      });
      await assert.isRejected(signPromise, /signing error/);
    }));

  it('parses listing metadata as JSON and passes through to submitAddon', () =>
    withTempDir(async (tmpDir) => {
      const stubs = getStubs();
      const metaDataJson = { version: { license: 'MPL2.0' } };
      const amoMetadata = 'path/to/metadata.json';
      const asyncFsReadFileStub = sinon.spy(() =>
        Promise.resolve(new Buffer(JSON.stringify(metaDataJson)))
      );

      return sign(tmpDir, stubs, {
        extraArgs: {
          useSubmissionApi: true,
          channel: 'listed',
          amoMetadata,
        },
        extraOptions: {
          asyncFsReadFile: asyncFsReadFileStub,
        },
      }).then(() => {
        sinon.assert.called(stubs.submitAddon);
        sinon.assert.calledWithMatch(stubs.submitAddon, { metaDataJson });
        sinon.assert.calledWith(asyncFsReadFileStub, amoMetadata);
      });
    }));

  it('raises an error on invalid JSON', () =>
    withTempDir(async (tmpDir) => {
      const stubs = getStubs();
      const amoMetadata = 'path/to/metadata.json';
      const asyncFsReadFileStub = sinon.spy(() =>
        Promise.resolve(new Buffer('{"broken":"json"'))
      );

      const signPromise = sign(tmpDir, stubs, {
        extraArgs: { amoMetadata },
        extraOptions: {
          asyncFsReadFile: asyncFsReadFileStub,
        },
      });
      await assert.isRejected(signPromise, UsageError);
      await assert.isRejected(signPromise, /Invalid JSON in listing metadata/);
      sinon.assert.calledWith(asyncFsReadFileStub, amoMetadata);
    }));

  describe('getIdFromFile', () => {
    it('gets a saved extension ID', () =>
      withTempDir((tmpDir) => {
        const idFile = path.join(tmpDir.path(), extensionIdFile);
        return saveIdToFile(idFile, 'some-id')
          .then(() => getIdFromFile(idFile))
          .then((extensionId) => {
            assert.equal(extensionId, 'some-id');
          });
      }));

    it('throws an error for empty files', () =>
      withTempDir(async (tmpDir) => {
        const idFile = path.join(tmpDir.path(), extensionIdFile);
        await fs.writeFile(idFile, '');
        const getIdPromise = getIdFromFile(idFile);
        await assert.isRejected(getIdPromise, UsageError);
        await assert.isRejected(
          getIdPromise,
          /No ID found in extension ID file/
        );
      }));

    it('returns empty ID when extension file does not exist', () =>
      withTempDir((tmpDir) => {
        const idFile = path.join(tmpDir.path(), extensionIdFile);
        return getIdFromFile(idFile).then((savedId) => {
          assert.strictEqual(savedId, undefined);
        });
      }));

    it('throws unexpected errors', async () => {
      const fakeAsyncFsReadFile = sinon.spy(async () => {
        throw new Error('Unexpected fs.readFile error');
      });
      await assert.isRejected(
        getIdFromFile('fakeIdFile', fakeAsyncFsReadFile),
        /Unexpected fs.readFile error/
      );

      sinon.assert.calledOnce(fakeAsyncFsReadFile);
    });
  });
});

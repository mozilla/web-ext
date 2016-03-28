/* @flow */
import path from 'path';
import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {withTempDir} from '../../src/util/temp-dir';
import {basicManifest} from '../test-util/test.manifest';
import completeSignCommand from '../../src/cmd/sign';
import {makeSureItFails, fixturePath} from '../helpers';


describe('sign', () => {

  function getStubs() {
    const signingConfig = {
      apiKey: 'AMO JWT issuer',
      apiSecret: 'AMO JWT secret',
      apiUrlPrefix: 'http://not-the-real-amo.com/api/v3',
    };

    const buildResult = {
      extensionPath: '/tmp/built-web-extension.xpi',
    };
    const build = sinon.spy(() => Promise.resolve(buildResult));

    const signingResult = {
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
  function sign(artifactsDir, stubs) {
    return completeSignCommand({
      sourceDir: '/fake/path/to/local/extension',
      artifactsDir,
      ...stubs.signingConfig,
    }, {
      ...stubs,
    });
  }

  it('builds and signs an extension', () => withTempDir(
    // This test only stubs out the signer in an effort to integrate
    // all other parts of the process.
    (tmpDir) => {
      let stubs = getStubs();
      const artifactsDir = path.join(tmpDir.path(), 'artifacts');
      return completeSignCommand(
        {
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir,
          ...stubs.signingConfig,
        }, {
          signAddon: stubs.signAddon,
        })
        .then((result) => {
          assert.equal(result.success, true);
          // Do a sanity check that a built extension was passed to the
          // signer.
          assert.include(stubs.signAddon.firstCall.args[0].xpiPath,
                         'minimal_extension-1.0.xpi');
        });
    }
  ));

  it('returns a signing result', () => withTempDir(
    (tmpDir) => {
      let stubs = getStubs();
      return sign(tmpDir.path(), stubs)
        .then((realResult) => {
          assert.deepEqual(realResult, stubs.signingResult);
        });
    }
  ));

  it('calls the add-on signer', () => withTempDir(
    (tmpDir) => {
      let stubs = getStubs();
      return sign(tmpDir.path(), stubs)
        .then(() => {
          assert.equal(stubs.signAddon.called, true);
          let signedAddonCall = stubs.signAddon.firstCall.args[0];
          assert.equal(signedAddonCall.apiKey,
                       stubs.signingConfig.apiKey);
          assert.equal(signedAddonCall.apiSecret,
                       stubs.signingConfig.apiSecret);
          assert.equal(signedAddonCall.apiUrlPrefix,
                       stubs.signingConfig.apiUrlPrefix);
          assert.equal(signedAddonCall.xpiPath,
                       stubs.buildResult.extensionPath);
          assert.equal(signedAddonCall.id,
                       stubs.preValidatedManifest.applications.gecko.id);
          assert.equal(signedAddonCall.version,
                       stubs.preValidatedManifest.version);
          assert.equal(signedAddonCall.downloadDir,
                       tmpDir.path());
        });
    }
  ));

  it('passes through a signing exception', () => withTempDir(
    (tmpDir) => {
      let stubs = getStubs();
      stubs.signAddon = () => Promise.reject(new Error('some signing error'));

      return sign(tmpDir.path(), stubs)
        .then(makeSureItFails())
        .catch((error) => {
          assert.match(error.message, /signing error/);
        });
    }
  ));

});

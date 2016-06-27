/* @flow */
import {signAddon as defaultAddonSigner} from '../util/es6-modules';

import defaultBuilder from './build';
import {InvalidManifest} from '../errors';
import {withTempDir} from '../util/temp-dir';
import getValidatedManifest from '../util/manifest';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';

const log = createLogger(__filename);


export default function sign(
    {verbose, sourceDir, artifactsDir, apiKey, apiSecret,
     apiUrlPrefix, timeout}: Object,
    {build=defaultBuilder, signAddon=defaultAddonSigner,
     preValidatedManifest=null}: Object = {}): Promise {

  return withTempDir(
    (tmpDir) => {
      return prepareArtifactsDir(artifactsDir)
        .then(() => {
          if (preValidatedManifest) {
            return preValidatedManifest;
          } else {
            return getValidatedManifest(sourceDir);
          }
        })
        .then((manifestData) => {
          if (!manifestData.applications) {
            // TODO: remove this when signing supports manifests
            // without IDs: https://github.com/mozilla/web-ext/issues/178
            throw new InvalidManifest(
              'applications.gecko.id in manifest.json is required for signing');
          }
          return manifestData;
        })
        .then((manifestData) => {
          return build(
            {sourceDir, artifactsDir: tmpDir.path()},
            {manifestData})
            .then((buildResult) => {
              return {buildResult, manifestData};
            });
        })
        .then(({buildResult, manifestData}) => signAddon({
          apiKey,
          apiSecret,
          apiUrlPrefix,
          timeout,
          verbose,
          xpiPath: buildResult.extensionPath,
          id: manifestData.applications.gecko.id,
          version: manifestData.version,
          downloadDir: artifactsDir,
        }))
        .then((signingResult) => {
          // All information about the downloaded files would have
          // already been logged by signAddon().
          log.info(signingResult.success ? 'SUCCESS' : 'FAIL');
          return signingResult;
        });
    }
  );
}

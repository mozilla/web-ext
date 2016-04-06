/* @flow */
import {signAddon as defaultAddonSigner} from '../util/es6-modules';

import defaultBuilder from './build';
import {withTempDir} from '../util/temp-dir';
import getValidatedManifest from '../util/manifest';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';

const log = createLogger(__filename);


export default function sign(
    {verbose, sourceDir, artifactsDir, apiKey, apiSecret,
     apiUrlPrefix}: Object,
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

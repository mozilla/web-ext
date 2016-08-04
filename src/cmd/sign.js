/* @flow */
import path from 'path';
import {fs} from 'mz';
import defaultAddonSigner from 'sign-addon';

import defaultBuilder from './build';
import {withTempDir} from '../util/temp-dir';
import {onlyErrorsWithCode, WebExtError} from '../errors';
import getValidatedManifest, {getManifestId} from '../util/manifest';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';

const log = createLogger(__filename);
export const extensionIdFile = '.web-extension-id';

export default function sign(
    {verbose, sourceDir, artifactsDir, apiKey, apiSecret,
     apiUrlPrefix, id, timeout}: Object,
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
          return Promise.all([
            build({sourceDir, artifactsDir: tmpDir.path()}, {manifestData}),
            getIdFromSourceDir(sourceDir),
          ])
          .then(([buildResult, idFromSourceDir]) => {
            return {buildResult, manifestData, idFromSourceDir};
          });
        })
        .then(({buildResult, manifestData, idFromSourceDir}) => {
          const manifestId = getManifestId(manifestData);
          if (id && manifestId) {
            throw new WebExtError(
              `Cannot set custom ID ${id} because manifest.json ` +
              `declares ID ${manifestId}`);
          }
          if (manifestId) {
            id = manifestId;
          }
          if (!id && idFromSourceDir) {
            log.info(
              'Using previously auto-generated extension ID: ' +
              `${idFromSourceDir}`);
            id = idFromSourceDir;
          }
          if (!id) {
            log.warn('No extension ID specified (it will be auto-generated)');
          }
          return signAddon({
            apiKey,
            apiSecret,
            apiUrlPrefix,
            timeout,
            verbose,
            id,
            xpiPath: buildResult.extensionPath,
            version: manifestData.version,
            downloadDir: artifactsDir,
          });
        })
        .then((signingResult) => {
          if (signingResult.id) {
            return saveIdToSourceDir(sourceDir, signingResult.id)
              .then(() => signingResult);
          } else {
            return signingResult;
          }
        })
        .then((signingResult) => {
          // All information about the downloaded files would have
          // already been logged by signAddon().
          if (signingResult.success) {
            log.info(`Extension ID: ${signingResult.id}`);
            log.info('SUCCESS');
          } else {
            log.info('FAIL');
          }
          return signingResult;
        });
    }
  );
}


export function getIdFromSourceDir(sourceDir: string): Promise {
  const filePath = path.join(sourceDir, extensionIdFile);
  return fs.readFile(filePath)
    .then((content) => {
      let lines = content.toString().split('\n');
      lines = lines.filter((line) => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          return line;
        }
      });
      let id = lines[0];
      log.debug(`Found extension ID ${id} in ${filePath}`);
      if (!id) {
        throw new WebExtError(`No ID found in extension ID file ${filePath}`);
      }
      return id;
    })
    .catch(onlyErrorsWithCode('ENOENT', () => {
      log.debug(`No ID file found at: ${filePath}`);
    }));
}


export function saveIdToSourceDir(sourceDir: string, id: string): Promise {
  const filePath = path.join(sourceDir, extensionIdFile);
  return fs.writeFile(filePath,
    [
      '# This file was created by https://github.com/mozilla/web-ext',
      '# Your auto-generated extension ID for addons.mozilla.org is:',
      id.toString(),
    ].join('\n'))
    .then(() => {
      log.debug(`Saved auto-generated ID ${id} to ${filePath}`);
    });
}

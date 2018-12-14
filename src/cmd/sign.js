/* @flow */
import path from 'path';

import {fs} from 'mz';
import defaultAddonSigner from 'sign-addon';

import defaultBuilder from './build';
import getValidatedManifest, {getManifestId} from '../util/manifest';
import {withTempDir} from '../util/temp-dir';
import {isErrorWithCode, UsageError, WebExtError} from '../errors';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';
import type {ExtensionManifest} from '../util/manifest';


const log = createLogger(__filename);

export const extensionIdFile = '.web-extension-id';

// Sign command types and implementation.

export type SignParams = {|
  apiKey: string,
  apiProxy: string,
  apiSecret: string,
  apiUrlPrefix: string,
  artifactsDir: string,
  id?: string,
  ignoreFiles?: Array<string>,
  sourceDir: string,
  timeout: number,
  verbose?: boolean,
  channel?: string,
|};

export type SignOptions = {
  build?: typeof defaultBuilder,
  signAddon?: typeof defaultAddonSigner,
  preValidatedManifest?: ExtensionManifest,
  shouldExitProgram?: boolean,
};

export type SignResult = {|
  success: boolean,
  id: string,
  downloadedFiles: Array<string>,
|};

export default function sign(
  {
    apiKey,
    apiProxy,
    apiSecret,
    apiUrlPrefix,
    artifactsDir,
    id,
    ignoreFiles = [],
    sourceDir,
    timeout,
    verbose,
    channel,
  }: SignParams,
  {
    build = defaultBuilder,
    preValidatedManifest,
    signAddon = defaultAddonSigner,
  }: SignOptions = {}
): Promise<SignResult> {
  return withTempDir(
    async function(tmpDir) {
      await prepareArtifactsDir(artifactsDir);

      let manifestData;

      if (preValidatedManifest) {
        manifestData = preValidatedManifest;
      } else {
        manifestData = await getValidatedManifest(sourceDir);
      }

      const [buildResult, idFromSourceDir] = await Promise.all([
        build({sourceDir, ignoreFiles, artifactsDir: tmpDir.path()},
              {manifestData, showReadyMessage: false}),
        getIdFromSourceDir(sourceDir),
      ]);

      const manifestId = getManifestId(manifestData);

      if (id && manifestId) {
        throw new UsageError(
          `Cannot set custom ID ${id} because manifest.json ` +
          `declares ID ${manifestId}`);
      }
      if (id) {
        log.debug(`Using custom ID declared as --id=${id}`);
      }

      if (manifestId) {
        id = manifestId;
      }

      if (!id && idFromSourceDir) {
        log.info(
          `Using previously auto-generated extension ID: ${idFromSourceDir}`);
        id = idFromSourceDir;
      }

      if (!id) {
        log.warn('No extension ID specified (it will be auto-generated)');
      }

      const signingResult = await signAddon({
        apiKey,
        apiSecret,
        apiUrlPrefix,
        apiProxy,
        timeout,
        verbose,
        id,
        xpiPath: buildResult.extensionPath,
        version: manifestData.version,
        downloadDir: artifactsDir,
        channel,
      });

      if (signingResult.id) {
        await saveIdToSourceDir(sourceDir, signingResult.id);
      }

      // All information about the downloaded files would have
      // already been logged by signAddon().
      if (signingResult.success) {
        log.info(`Extension ID: ${signingResult.id}`);
        log.info('SUCCESS');
      } else {
        log.info('FAIL');
        throw new WebExtError(
          'The extension could not be signed');
      }

      return signingResult;
    }
  );
}


export async function getIdFromSourceDir(
  sourceDir: string
): Promise<string | void> {
  const filePath = path.join(sourceDir, extensionIdFile);

  let content;

  try {
    content = await fs.readFile(filePath);
  } catch (error) {
    if (isErrorWithCode('ENOENT', error)) {
      log.debug(`No ID file found at: ${filePath}`);
      return;
    }
    throw error;
  }

  let lines = content.toString().split('\n');
  lines = lines.filter((line) => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      return line;
    }
  });

  const id = lines[0];
  log.debug(`Found extension ID ${id} in ${filePath}`);

  if (!id) {
    throw new UsageError(`No ID found in extension ID file ${filePath}`);
  }

  return id;
}


export async function saveIdToSourceDir(
  sourceDir: string, id: string
): Promise<void> {
  const filePath = path.join(sourceDir, extensionIdFile);
  await fs.writeFile(filePath, [
    '# This file was created by https://github.com/mozilla/web-ext',
    '# Your auto-generated extension ID for addons.mozilla.org is:',
    id.toString(),
  ].join('\n'));

  log.debug(`Saved auto-generated ID ${id} to ${filePath}`);
}

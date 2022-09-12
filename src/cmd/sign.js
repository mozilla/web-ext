/* @flow */
import path from 'path';

import {fs} from 'mz';
import {signAddon as defaultAddonSigner} from 'sign-addon';

import defaultBuilder from './build.js';
import {isErrorWithCode, UsageError, WebExtError} from '../errors.js';
import {prepareArtifactsDir} from '../util/artifacts.js';
import {createLogger} from '../util/logger.js';
import getValidatedManifest, {getManifestId} from '../util/manifest.js';
import type {ExtensionManifest} from '../util/manifest.js';
import { signAddon as defaultSubmitAddonSigner } from '../util/submit-addon.js';
import type { SignResult } from '../util/submit-addon.js';
import {withTempDir} from '../util/temp-dir.js';

export type { SignResult };

const log = createLogger(import.meta.url);

const defaultAsyncFsReadFile: (string) => Promise<Buffer> =
  fs.readFile.bind(fs);

export const extensionIdFile = '.web-extension-id';

// Sign command types and implementation.

export type SignParams = {|
  amoBaseUrl: string,
  apiKey: string,
  apiProxy?: string,
  apiSecret: string,
  apiUrlPrefix: string,
  useSubmissionApi?: boolean,
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
  submitAddon?: typeof defaultSubmitAddonSigner,
  preValidatedManifest?: ExtensionManifest,
  shouldExitProgram?: boolean,
};

export default function sign(
  {
    amoBaseUrl,
    apiKey,
    apiProxy,
    apiSecret,
    apiUrlPrefix,
    useSubmissionApi = false,
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
    submitAddon = defaultSubmitAddonSigner,
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

      if (useSubmissionApi && id && !manifestId) {
        throw new UsageError(
          `Cannot set custom ID ${id} - addon submission API requires a ` +
          'custom ID be specified in the manifest'
        );
      }
      if (useSubmissionApi && idFromSourceDir && !manifestId) {
        throw new UsageError(
          'Cannot use previously auto-generated extension ID ' +
          `${idFromSourceDir} - addon submission API ` +
          'requires a custom ID be specified in the manifest'
        );
      }
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

      if (useSubmissionApi && !channel) {
        throw new UsageError(
          'channel is a required parameter for the addon submission API'
        );
      }

      if (useSubmissionApi && apiProxy) {
        // https://github.com/mozilla/web-ext/issues/2472
        throw new UsageError(
          "apiProxy isn't yet supported for the addon submission API. " +
          'See https://github.com/mozilla/web-ext/issues/2472'
        );
      }

      const signSubmitArgs = {
        apiKey,
        apiSecret,
        timeout,
        id,
        xpiPath: buildResult.extensionPath,
        downloadDir: artifactsDir,
        channel,
      };

      let result;
      try {
        if (useSubmissionApi) {
          // $FlowIgnore: we verify 'channel' is set above
          result = await submitAddon({...signSubmitArgs, amoBaseUrl, channel});
        } else {
          const { success, id: newId, downloadedFiles } = await signAddon({
            ...signSubmitArgs,
            apiUrlPrefix,
            apiProxy,
            verbose,
            version: manifestData.version,
          });
          if (!success) {
            throw new Error('The extension could not be signed');
          }
          result = { id: newId, downloadedFiles };
        }
      } catch (clientError) {
        log.info('FAIL');
        throw new WebExtError(clientError.message);
      }

      // All information about the downloaded files would have
      // already been logged by signAddon() or submitAddon().
      await saveIdToSourceDir(sourceDir, result.id);
      log.info(`Extension ID: ${result.id}`);
      log.info('SUCCESS');
      return result;
    });
}


export async function getIdFromSourceDir(
  sourceDir: string,
  asyncFsReadFile: typeof defaultAsyncFsReadFile = defaultAsyncFsReadFile,
): Promise<string | void> {
  const filePath = path.join(sourceDir, extensionIdFile);

  let content;

  try {
    content = await asyncFsReadFile(filePath);
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

import path from 'path';

import { signAddon as defaultAddonSigner } from 'sign-addon';

import defaultBuilder from './build.js';
import { isErrorWithCode, UsageError, WebExtError } from '../errors.js';
import { prepareArtifactsDir } from '../util/artifacts.js';
import { createLogger } from '../util/logger.js';
import getValidatedManifest, { getManifestId } from '../util/manifest.js';
import {
  defaultAsyncFsReadFile,
  signAddon as defaultSubmitAddonSigner,
  saveIdToFile,
} from '../util/submit-addon.js';
import { withTempDir } from '../util/temp-dir.js';
import { isTTY } from '../util/stdin.js';

const log = createLogger(import.meta.url);

export const extensionIdFile = '.web-extension-id';
export const uploadUuidFile = '.amo-upload-uuid';

// Sign command types and implementation.

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
    disableProgressBar = !isTTY(process.stdin),
    verbose,
    channel,
    amoMetadata,
    webextVersion,
  },
  {
    build = defaultBuilder,
    preValidatedManifest,
    signAddon = defaultAddonSigner,
    submitAddon = defaultSubmitAddonSigner,
    asyncFsReadFile = defaultAsyncFsReadFile,
  } = {}
) {
  return withTempDir(async function (tmpDir) {
    await prepareArtifactsDir(artifactsDir);

    let manifestData;
    const savedIdPath = path.join(sourceDir, extensionIdFile);
    const savedUploadUuidPath = path.join(sourceDir, uploadUuidFile);

    if (preValidatedManifest) {
      manifestData = preValidatedManifest;
    } else {
      manifestData = await getValidatedManifest(sourceDir);
    }

    const [buildResult, idFromSourceDir] = await Promise.all([
      build(
        { sourceDir, ignoreFiles, artifactsDir: tmpDir.path() },
        { manifestData, showReadyMessage: false }
      ),
      getIdFromFile(savedIdPath),
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
          `declares ID ${manifestId}`
      );
    }
    if (id) {
      log.debug(`Using custom ID declared as --id=${id}`);
    }

    if (manifestId) {
      id = manifestId;
    }

    if (!id && idFromSourceDir) {
      log.info(
        `Using previously auto-generated extension ID: ${idFromSourceDir}`
      );
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

    let metaDataJson;
    if (amoMetadata) {
      const metadataFileBuffer = await asyncFsReadFile(amoMetadata);
      try {
        metaDataJson = JSON.parse(metadataFileBuffer.toString());
      } catch (err) {
        throw new UsageError('Invalid JSON in listing metadata');
      }
    }
    const userAgentString = `web-ext/${webextVersion}`;

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
        result = await submitAddon({
          ...signSubmitArgs,
          amoBaseUrl,
          channel,
          savedIdPath,
          savedUploadUuidPath,
          metaDataJson,
          userAgentString,
        });
      } else {
        const {
          success,
          id: newId,
          downloadedFiles,
        } = await signAddon({
          ...signSubmitArgs,
          apiUrlPrefix,
          apiProxy,
          disableProgressBar,
          verbose,
          version: manifestData.version,
          apiRequestConfig: { headers: { 'User-Agent': userAgentString } },
        });
        if (!success) {
          throw new Error('The extension could not be signed');
        }
        result = { id: newId, downloadedFiles };
        // All information about the downloaded files would have already been
        // logged by signAddon(). submitAddon() calls saveIdToFile itself.
        await saveIdToFile(savedIdPath, newId);
        log.info(`Extension ID: ${newId}`);
        log.info('SUCCESS');
      }
    } catch (clientError) {
      log.info('FAIL');
      throw new WebExtError(clientError.message);
    }

    return result;
  });
}

export async function getIdFromFile(
  filePath,
  asyncFsReadFile = defaultAsyncFsReadFile
) {
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

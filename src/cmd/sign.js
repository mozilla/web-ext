/* @flow */
import path from 'path';
import {fs} from 'mz';
import defaultAddonSigner from 'sign-addon';
import {httpFetchFile} from '../util/net';
import url from 'url';

import defaultBuilder from './build';
import {withTempDir} from '../util/temp-dir';
import {isErrorWithCode, WebExtError} from '../errors';
import getValidatedManifest, {getManifestId} from '../util/manifest';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';


const log = createLogger(__filename);

export const extensionIdFile = '.web-extension-id';


// Import flow types.

import type {ExtensionManifest} from '../util/manifest';


// Sign command types and implementation.

export type SignParams = {
  id?: string,
  verbose?: boolean,
  sourceDir: string,
  artifactsDir: string,
  apiKey: string,
  apiSecret: string,
  apiUrlPrefix: string,
  timeout: number,
  updateLink: string
};

export type SignOptions = {
  build?: typeof defaultBuilder,
  signAddon?: typeof defaultAddonSigner,
  preValidatedManifest?: ExtensionManifest,
};

export type SignResult = {
  success: boolean,
  id: string,
  downloadedFiles: Array<string>,
};

export default function sign(
  {
    verbose, sourceDir, artifactsDir, apiKey, apiSecret,
    apiUrlPrefix, id, timeout, updateLink,
  }: SignParams,
  {
    build = defaultBuilder, signAddon = defaultAddonSigner,
    preValidatedManifest,
  }: SignOptions = {}
): Promise<SignResult> {
  return withTempDir(
    async function (tmpDir) {
      await prepareArtifactsDir(artifactsDir);

      let manifestData;

      if (preValidatedManifest) {
        manifestData = preValidatedManifest;
      } else {
        manifestData = await getValidatedManifest(sourceDir);
      }

      let [buildResult, idFromSourceDir] = await Promise.all([
        build({sourceDir, artifactsDir: tmpDir.path()}, {manifestData}),
        getIdFromSourceDir(sourceDir),
      ]);

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
          `Using previously auto-generated extension ID: ${idFromSourceDir}`);
        id = idFromSourceDir;
      }

      if (!id) {
        log.warn('No extension ID specified (it will be auto-generated)');
      }

      let oldUpdateManifestData = await fetchUpdateManifest(manifestData);
      prevalidateUpdateManifestParams(manifestData, updateLink);

      let signingResult = await signAddon({
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

      if (updateLink && signingResult.success) {
        let extensionID;
        if (signingResult.id) {
          extensionID = signingResult.id;
        } else {
          extensionID = id;
        }
        // id, XPIPath, artifactsDir,
        // manifestData, updateLink, oldUpdateManifestData
        await generateNewUpdateManifest(
          extensionID, signingResult.downloadedFiles[0], artifactsDir,
          manifestData, updateLink, oldUpdateManifestData,
        );
      }

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
      }

      return signingResult;
    }
  );
}

/**
 * Fetches an updateManifest.json file from a remote web server
 */
function fetchUpdateManifest(manifestData: Object): Object {
  return new Promise(async function (resolve, reject) {
    let oldUpdateManifest;
    let statusCode;

    try {
      [oldUpdateManifest, statusCode] = await httpFetchFile(
        manifestData.applications.gecko.update_url);
      if (statusCode < 200 || statusCode > 290) {
        throw new WebExtError(
          `Failed to retrieve ${updateManifestFileName}\n` +
          `http statusCode error, server responded with: ${statusCode}`);
        reject();
      }
    } catch (e) {
      throw new WebExtError(
        `Was unable to download ${updateManifestFileName}\nerror is: ${e}`);
      reject();
    }

    try {
      resolve(JSON.parse(oldUpdateManifest));
    } catch (e) {
      throw new WebExtError(
        `Unable to parse ${updateManifestFileName} file located at ` +
        `${manifestData.applications.gecko.update_url}`);
      reject();
    }
  });
}

/**
 * Validates all data needed to generate a new updatemanifest
 * if some data is missing/corrupt, the manifest can't be generated
 */
function prevalidateUpdateManifestParams(manifestData, updateLink) {
  // ..first validate if the manifest has the right properties
  // manifestData.applications.gecko.updateUrl
  // note: `var == null` is equal to
  // `(variable === undefined || variable === null)`
  // see: https://stackoverflow.com/questions/2647867
  if (manifestData == null ||
      manifestData.applications == null ||
      manifestData.applications.gecko == null ||
      manifestData.applications.gecko.update_url == null) {
    throw new WebExtError(
      'update-link was passed, but the manifest.json ' +
      'is missing the .applications.gecko.update_url property. ' +
      'therefore, no updateManifest could be generated');
  return false;
  } else {
    // check if the update_url property contains a usable URL
    let parsed = url.parse(manifestData.applications.gecko.update_url);
    if (parsed == null || parsed.pathname == null) {
      throw new WebExtError(
        'Was unable to parse manifest.applications.gecko.update_url ' +
        'please check this property in your manifest: ' +
        `${manifestData.applications.gecko.update_url}`)
      return false;
    }
  }

  // manifestData.version
  if (manifestData.name == null) {
    throw new WebExtError(
      'update-link was passed but the manifest.json ' +
      'is missing the .name property. ' +
      'therefore, no updateManifest could be generated');
    return false;
  }

  // ..lastly check if the passed updateLink parameter is correct
  if (updateLink.indexOf('{xpiFileName}') === -1) {
    throw new WebExtError(
      'Unable to parse --update-link url, please use {xpiFileName} ' +
      'as a substitute for the XPI file');
    return false;
  }

  return true;
}

/**
 * Generates a new updateManifest.json file
 * It will add an entry to a previously fetched updateManifest.json file
 * for each generated XPI file.
 * The result will be stored in the artifacts directory
 */
async function generateNewUpdateManifest(
  id: ?string, XPIPath: string, artifactsDir,
  manifestData: Object, updateLink: string, oldUpdateManifestData: Object
) {
  let updateManifestFileName;
  let newUpdateManifest;

  let parsed = url.parse(manifestData.applications.gecko.update_url);
  if (parsed !== undefined && parsed.pathname !== undefined) {
    updateManifestFileName = path.basename(parsed.pathname);
  }

  let newVersion = {
    version: manifestData.version,
    update_link: updateLink.replace('{xpiFileName}', path.basename(XPIPath))
  };

  if (oldUpdateManifestData.addons == null) {
    // if the addons property did not exist,
    // it means that the updateManifest is completely new.
    // In case the developer forgot to add .addons, do it here automatically
    oldUpdateManifestData.addons = {};
  }

  if (id && oldUpdateManifestData.addons[id]) {
    // append a new release to the updateManifest
    if (oldUpdateManifestData.addons[id].updates) {
      oldUpdateManifestData.addons[id].updates.push(newVersion);
    }
  } else {
    // the extensionID was not found in the .addons property
    // this can mean either that this is the first release of an extension
    // OR that the extensionID changed,
    // we'll warn the user about the second scenario just to be sure.
    let addonName = manifestData.name || 'your application';
    log.warn(`Creating first release of ${addonName}`);
    log.warn(
      'If this is not the actual first release, check your extension-id');
    oldUpdateManifestData.addons[id] = {};
    oldUpdateManifestData.addons[id].updates = [newVersion];
  }

  // the oldUpdateManifest has been updated, it's ready to be saved
  // prettify it so it's readable to the maintainers
  newUpdateManifest = JSON.stringify(oldUpdateManifestData, null, 4);

  return fs.writeFile(
    path.join(artifactsDir, updateManifestFileName),
    newUpdateManifest,
    function(error) {
      if (error) {
        throw new WebExtError(
          `Was unable to write updated ${addonName}\n` +
          error);
      }
  });
}

export async function getIdFromSourceDir(
  sourceDir: string
): Promise<string|void> {
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

  let id = lines[0];
  log.debug(`Found extension ID ${id} in ${filePath}`);

  if (!id) {
    throw new WebExtError(`No ID found in extension ID file ${filePath}`);
  }

  return id;
}

export async function saveIdToSourceDir(sourceDir: string, id: string)
    : Promise<void> {
  const filePath = path.join(sourceDir, extensionIdFile);
  await fs.writeFile(filePath, [
    '# This file was created by https://github.com/mozilla/web-ext',
    '# Your auto-generated extension ID for addons.mozilla.org is:',
    id.toString(),
  ].join('\n'));

  log.debug(`Saved auto-generated ID ${id} to ${filePath}`);
}

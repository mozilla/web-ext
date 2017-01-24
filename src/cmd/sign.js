/* @flow */
import path from 'path';
import {fs} from 'mz';
import defaultAddonSigner from 'sign-addon';
import rp from 'request-promise';
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

export type UpdateManifest = {
  addons: {[key: string]: {
    updates: Array<Object>
  }}
};

export type NewUpdateManifestArgs = {
  id: string,
  XPIPath: string,
  artifactsDir: string,
  manifestData: Object,
  updateLink: string,
  oldUpdateManifestData: UpdateManifest
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

      // note that we assign an empty object instead of leaving the variable
      // undefined because of a problem with flow, see
      let oldUpdateManifestData = {
        addons: {},
      };
      if (updateLink) {
        prevalidateUpdateManifestParams(manifestData, updateLink);
        oldUpdateManifestData = await fetchUpdateManifest(manifestData);
      }

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

      if (updateLink) {
        if (signingResult.downloadedFiles.length > 1) {
          throw new WebExtError(
            'The downloaded files array should only be greater than 1' +
            'in legacy cases, this is not supported.');
        }
        await createNewUpdateManifest({
          id: signingResult.id,
          XPIPath: signingResult.downloadedFiles[0],
          artifactsDir: artifactsDir,
          manifestData: manifestData,
          updateLink: updateLink,
          oldUpdateManifestData: oldUpdateManifestData,
        });
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
async function fetchUpdateManifest(manifestData: Object)
: Promise<UpdateManifest> {
  let oldUpdateManifest;

  let parsed = url.parse(manifestData.applications.gecko.update_url);
  let updateManifestFileName = '';
  // these will never be null, since parsed and parsed.pathname
  // are already validated in an earlier function
  // the `if` is only to please flow
  if (parsed != null && parsed.pathname != null) {
    updateManifestFileName = path.basename(parsed.pathname);
  }

  try {
    let response = await rp(manifestData.applications.gecko.update_url, {
      resolveWithFullResponse: true,
    });
    if (response.statusCode < 200 || response.statusCode > 290) {
      throw new WebExtError(
        `Failed to retrieve ${updateManifestFileName}\n
http statusCode error, server responded with: ${response.statusCode}`);
    }

    oldUpdateManifest = response.body;
  } catch (error) {
    throw new WebExtError(
      `Was unable to download ${updateManifestFileName}\nerror is: ${error}`);
  }

  try {
    return JSON.parse(oldUpdateManifest);
  } catch (error) {
    let originalError = error.toString();
    throw new WebExtError(
      `Unable to parse ${updateManifestFileName} file located at
 ${manifestData.applications.gecko.update_url} because\n${originalError}`);
  }
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
  } else {
    // check if the update_url property contains a usable URL
    let parsed = url.parse(manifestData.applications.gecko.update_url);
    if (parsed == null || parsed.pathname == null) {
      // the most elaborate flow workaround
      let applications =
        manifestData.applications == null ?
        {gecko: manifestData.applications.gecko} : manifestData.applications;
      let gecko =
        applications.gecko == null ?
        {gecko: applications.gecko} : manifestData.applications.gecko;
      let updateUrl =
        gecko.update_url == null ?
        gecko.update_url : gecko.update_url; // flow please
      throw new WebExtError(
        'Was unable to parse manifest.applications.gecko.update_url ' +
        'please check this property in your manifest: ' +
        `${updateUrl}`);
    }
  }

  // manifestData.version
  if (manifestData.name == null) {
    throw new WebExtError(
      'update-link was passed but the manifest.json ' +
      'is missing the .name property. ' +
      'therefore, no updateManifest could be generated');
  }

  // ..lastly check if the passed updateLink parameter is correct
  if (updateLink.indexOf('{xpiFileName}') === -1) {
    throw new WebExtError(
      'Unable to parse --update-link url, please use {xpiFileName} ' +
      'as a substitute for the XPI file');
  }
}

/**
 * Generates a new updateManifest.json file
 * It will add an entry to a previously fetched updateManifest.json file
 * for each generated XPI file.
 * The result will be stored in the --artifacts-dir folder
 */
// jslint incorrectly reports that this return statement should be a yield.
// eslint-disable-next-line
async function createNewUpdateManifest({
  id, XPIPath, artifactsDir, manifestData, updateLink, oldUpdateManifestData,
} : NewUpdateManifestArgs) {
  let updateManifestFileName = '';
  let newUpdateManifest;

  let addonName = manifestData.name || 'your application';

  let parsed = url.parse(manifestData.applications.gecko.update_url);
  // these if's are really only here to make flow happy
  // it doesn't seem to accept that path.basename returns a string
  if (parsed != null && parsed.pathname != null) {
    updateManifestFileName = path.basename(parsed.pathname);
  }

  let newVersion = {
    version: manifestData.version,
    update_link: updateLink.replace('{xpiFileName}', path.basename(XPIPath)),
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
    log.warn(`Creating first release of ${addonName}`);
    log.warn(
      'If this is not the actual first release, check your extension-id');
    oldUpdateManifestData.addons[id] = {
      updates: [newVersion],
    };
  }

  // the oldUpdateManifest has been updated, it's ready to be saved
  // prettify it so it's readable to the maintainers
  newUpdateManifest = JSON.stringify(oldUpdateManifestData, null, 4);

  return fs.writeFile(
    path.join(artifactsDir, updateManifestFileName),
    newUpdateManifest
  ).catch(function(error) {
    if (error) {
      throw new WebExtError(
        `Was unable to write updated ${addonName}\n ${error}`);
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

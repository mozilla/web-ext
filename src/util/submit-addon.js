import { createHash } from 'crypto';
import { createWriteStream, promises as fsPromises } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

// eslint-disable-next-line no-shadow
import fetch, { FormData, fileFromSync } from 'node-fetch';
import { SignJWT } from 'jose';
import JSZip from 'jszip';

import { isErrorWithCode } from '../errors.js';
import { createLogger } from './../util/logger.js';

const log = createLogger(import.meta.url);

export const defaultAsyncFsReadFile = fsPromises.readFile;

export class JwtApiAuth {
  #apiKey;
  #apiSecret;
  #apiJwtExpiresIn;

  constructor({
    apiKey,
    apiSecret,
    apiJwtExpiresIn = 60 * 5, // 5 minutes
  }) {
    this.#apiKey = apiKey;
    this.#apiSecret = apiSecret;
    this.#apiJwtExpiresIn = apiJwtExpiresIn;
  }

  async signJWT() {
    return (
      new SignJWT({ iss: this.#apiKey })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        // jose expects either:
        // a number, which is treated an absolute timestamp - so must be after now, or
        // a string, which is parsed as a relative time from now.
        .setExpirationTime(`${this.#apiJwtExpiresIn}seconds`)
        .sign(Uint8Array.from(Buffer.from(this.#apiSecret, 'utf8')))
    );
  }

  async getAuthHeader() {
    const authToken = await this.signJWT();
    return `JWT ${authToken}`;
  }
}

export default class Client {
  apiAuth;
  apiUrl;
  validationCheckInterval;
  validationCheckTimeout;
  approvalCheckInterval;
  approvalCheckTimeout;
  downloadDir;
  userAgentString;

  constructor({
    apiAuth,
    baseUrl,
    validationCheckInterval = 1000,
    validationCheckTimeout = 300000, // 5 minutes.
    approvalCheckInterval = 1000,
    approvalCheckTimeout = 900000, // 15 minutes.
    downloadDir = process.cwd(),
    userAgentString,
  }) {
    this.apiAuth = apiAuth;
    if (!baseUrl.pathname.endsWith('/')) {
      baseUrl = new URL(baseUrl.href);
      baseUrl.pathname += '/';
    }
    this.apiUrl = new URL('addons/', baseUrl);
    this.validationCheckInterval = validationCheckInterval;
    this.validationCheckTimeout = validationCheckTimeout;
    this.approvalCheckInterval = approvalCheckInterval;
    this.approvalCheckTimeout = approvalCheckTimeout;
    this.downloadDir = downloadDir;
    this.userAgentString = userAgentString;
  }

  fileFromSync(path) {
    return fileFromSync(path);
  }

  nodeFetch(url, { method, headers, body }) {
    return fetch(url, { method, headers, body });
  }

  async doUploadSubmit(xpiPath, channel) {
    const url = new URL('upload/', this.apiUrl);
    const formData = new FormData();
    formData.set('channel', channel);
    formData.set('upload', this.fileFromSync(xpiPath));
    const { uuid } = await this.fetchJson(url, 'POST', formData);
    return this.waitForValidation(uuid);
  }

  waitRetry(successFunc, checkUrl, checkInterval, abortInterval, context) {
    let checkTimeout;

    return new Promise((resolve, reject) => {
      const abortTimeout = setTimeout(() => {
        clearTimeout(checkTimeout);
        reject(new Error(`${context}: timeout.`));
      }, abortInterval);

      const pollStatus = async () => {
        try {
          const responseData = await this.fetchJson(
            checkUrl,
            'GET',
            undefined,
            'Getting details failed.'
          );

          const success = successFunc(responseData);
          if (success) {
            clearTimeout(abortTimeout);
            resolve(success);
          } else {
            // Still in progress, so wait for a while and try again.
            checkTimeout = setTimeout(pollStatus, checkInterval);
          }
        } catch (err) {
          clearTimeout(abortTimeout);
          reject(err);
        }
      };

      pollStatus();
    });
  }

  waitForValidation(uuid) {
    log.info('Waiting for Validation...');
    return this.waitRetry(
      (detailResponseData) => {
        if (!detailResponseData.processed) {
          return null;
        }

        log.info('Validation results:', detailResponseData.validation);
        if (detailResponseData.valid) {
          return detailResponseData.uuid;
        }

        log.info('Validation failed.');
        throw new Error(
          'Validation failed, open the following URL for more information: ' +
            `${detailResponseData.url}`
        );
      },
      new URL(`upload/${uuid}/`, this.apiUrl),
      this.validationCheckInterval,
      this.validationCheckTimeout,
      'Validation'
    );
  }

  async doNewAddonSubmit(uuid, metaDataJson) {
    const url = new URL('addon/', this.apiUrl);
    const jsonData = {
      ...metaDataJson,
      version: { upload: uuid, ...metaDataJson.version },
    };
    return this.fetchJson(url, 'POST', JSON.stringify(jsonData));
  }

  doNewAddonOrVersionSubmit(addonId, uuid, metaDataJson) {
    const url = new URL(`addon/${addonId}/`, this.apiUrl);
    const jsonData = {
      ...metaDataJson,
      version: { upload: uuid, ...metaDataJson.version },
    };
    return this.fetchJson(url, 'PUT', JSON.stringify(jsonData));
  }

  waitForApproval(addonId, versionId) {
    log.info('Waiting for Approval...');
    return this.waitRetry(
      (detailResponseData) => {
        const { file } = detailResponseData;
        if (file && file.status === 'public') {
          return file.url;
        }

        return null;
      },
      new URL(`addon/${addonId}/versions/${versionId}/`, this.apiUrl),
      this.approvalCheckInterval,
      this.approvalCheckTimeout,
      'Approval'
    );
  }

  async fetchJson(url, method = 'GET', body, errorMsg = 'Bad Request') {
    const response = await this.fetch(url, method, body);
    if (response.status < 200 || response.status >= 500) {
      throw new Error(
        `${errorMsg}: ${response.statusText || response.status}.`
      );
    }
    const data = await response.json();

    if (!response.ok) {
      log.info('Server Response:', data);
      throw new Error(
        `${errorMsg}: ${response.statusText || response.status}.`
      );
    }
    return data;
  }

  async fetch(url, method = 'GET', body) {
    log.info(`Fetching URL: ${url.href}`);
    let headers = {
      Authorization: await this.apiAuth.getAuthHeader(),
      Accept: 'application/json',
      'User-Agent': this.userAgentString,
    };
    if (typeof body === 'string') {
      headers = {
        ...headers,
        'Content-Type': 'application/json',
      };
    }
    return this.nodeFetch(url, { method, body, headers });
  }

  async downloadSignedFile(fileUrl, addonId) {
    const filename = fileUrl.pathname.split('/').pop(); // get the name from fileUrl
    const dest = `${this.downloadDir}/${filename}`;
    try {
      const response = await this.fetch(fileUrl);
      if (!response.ok || !response.body) {
        throw new Error(`response status was ${response.status}`);
      }
      await this.saveToFile(response.body, dest);
    } catch (error) {
      log.info(`Download of signed xpi failed: ${error}.`);
      throw new Error(`Downloading ${filename} failed`);
    }
    return {
      id: addonId,
      downloadedFiles: [filename],
    };
  }

  async saveToFile(contents, destPath) {
    return promisify(pipeline)(contents, createWriteStream(destPath));
  }

  /*
  This function aims to quickly hash the contents of the zip file that's being uploaded,
  to compare it to the previous zip file that was uploaded, so we can skip the upload for
  efficiency.

  CRCs are used from the zip to avoid having to extract and hash  all the files.

  Two zips that have different byte contents in their files must have a different hash;
  but returning a different hash when the contents are the same in some cases is acceptable
  - a false mismatch does not result in lost data.
  */
  async hashXpiCrcs(filePath, asyncFsReadFile = defaultAsyncFsReadFile) {
    const zip = await JSZip.loadAsync(
      asyncFsReadFile(filePath, { createFolders: true })
    );
    const hash = createHash('sha256');
    const entries = [];
    zip.forEach((relativePath, entry) => {
      let path = relativePath.replace(/\/+$/, '');
      if (entry.dir) {
        path += '/';
      }
      // if the file is 0 bytes or a dir `_data` is missing so assume crc is 0
      entries.push({ path, crc32: entry._data?.crc32 || 0 });
    });
    entries.sort((a, b) => (a.path === b.path ? 0 : a.path > b.path ? 1 : -1));
    hash.update(JSON.stringify(entries));
    return hash.digest('hex');
  }

  async getPreviousUuidOrUploadXpi(
    xpiPath,
    channel,
    savedUploadUuidPath,
    saveUploadUuidToFileFunc = saveUploadUuidToFile,
    getUploadUuidFromFileFunc = getUploadUuidFromFile
  ) {
    const [
      {
        uploadUuid: previousUuid,
        channel: previousChannel,
        xpiCrcHash: previousHash,
      },
      xpiCrcHash,
    ] = await Promise.all([
      getUploadUuidFromFileFunc(savedUploadUuidPath),
      this.hashXpiCrcs(xpiPath),
    ]);

    let uploadUuid;
    if (previousChannel !== channel || xpiCrcHash !== previousHash) {
      uploadUuid = await this.doUploadSubmit(xpiPath, channel);
      await saveUploadUuidToFileFunc(savedUploadUuidPath, {
        uploadUuid,
        channel,
        xpiCrcHash,
      });
    } else {
      uploadUuid = previousUuid;
    }
    return uploadUuid;
  }

  async postNewAddon(
    uploadUuid,
    savedIdPath,
    metaDataJson,
    saveIdToFileFunc = saveIdToFile
  ) {
    const {
      guid: addonId,
      version: { id: newVersionId },
    } = await this.doNewAddonSubmit(uploadUuid, metaDataJson);

    await saveIdToFileFunc(savedIdPath, addonId);
    log.info(`Generated extension ID: ${addonId}.`);
    log.info('You must add the following to your manifest:');
    log.info(`"browser_specific_settings": {"gecko": {"id": "${addonId}"}}`);

    const fileUrl = new URL(await this.waitForApproval(addonId, newVersionId));

    return this.downloadSignedFile(fileUrl, addonId);
  }

  async putVersion(uploadUuid, addonId, metaDataJson) {
    const {
      version: { id: newVersionId },
    } = await this.doNewAddonOrVersionSubmit(addonId, uploadUuid, metaDataJson);

    const fileUrl = new URL(await this.waitForApproval(addonId, newVersionId));

    return this.downloadSignedFile(fileUrl, addonId);
  }
}

export async function signAddon({
  apiKey,
  apiSecret,
  amoBaseUrl,
  timeout,
  id,
  xpiPath,
  downloadDir,
  channel,
  savedIdPath,
  savedUploadUuidPath,
  metaDataJson = {},
  userAgentString,
  SubmitClient = Client,
  ApiAuthClass = JwtApiAuth,
}) {
  try {
    const stats = await fsPromises.stat(xpiPath);

    if (!stats.isFile()) {
      throw new Error(`not a file: ${xpiPath}`);
    }
  } catch (statError) {
    throw new Error(`error with ${xpiPath}: ${statError}`);
  }

  let baseUrl;
  try {
    baseUrl = new URL(amoBaseUrl);
  } catch (err) {
    throw new Error(`Invalid AMO API base URL: ${amoBaseUrl}`);
  }

  const client = new SubmitClient({
    apiAuth: new ApiAuthClass({ apiKey, apiSecret }),
    baseUrl,
    validationCheckTimeout: timeout,
    approvalCheckTimeout: timeout,
    downloadDir,
    userAgentString,
  });
  const uploadUuid = await client.getPreviousUuidOrUploadXpi(
    xpiPath,
    channel,
    savedUploadUuidPath
  );

  // We specifically need to know if `id` has not been passed as a parameter because
  // it's the indication that a new add-on should be created, rather than a new version.
  if (id === undefined) {
    return client.postNewAddon(uploadUuid, savedIdPath, metaDataJson);
  }

  return client.putVersion(uploadUuid, id, metaDataJson);
}

export async function saveIdToFile(filePath, id) {
  await fsPromises.writeFile(
    filePath,
    [
      '# This file was created by https://github.com/mozilla/web-ext',
      '# Your auto-generated extension ID for addons.mozilla.org is:',
      id.toString(),
    ].join('\n')
  );

  log.debug(`Saved auto-generated ID ${id} to ${filePath}`);
}

export async function saveUploadUuidToFile(
  filePath,
  { uploadUuid, channel, xpiCrcHash }
) {
  await fsPromises.writeFile(
    filePath,
    JSON.stringify({ uploadUuid, channel, xpiCrcHash })
  );
  log.debug(
    `Saved upload UUID ${uploadUuid}, xpi crc hash ${xpiCrcHash}, and channel ${channel} to ${filePath}`
  );
}

export async function getUploadUuidFromFile(
  filePath,
  asyncFsReadFile = defaultAsyncFsReadFile
) {
  try {
    const content = await asyncFsReadFile(filePath, 'utf-8');
    const { uploadUuid, channel, xpiCrcHash } = JSON.parse(content);
    log.debug(
      `Found upload uuid:${uploadUuid}, channel:${channel}, hash:${xpiCrcHash} in ${filePath}`
    );
    return { uploadUuid, channel, xpiCrcHash };
  } catch (error) {
    if (isErrorWithCode('ENOENT', error)) {
      log.debug(`No upload uuid file found at: ${filePath}`);
    } else {
      log.debug(`Invalid upload uuid file contents in ${filePath}: ${error}`);
    }
  }

  return { uploadUuid: '', channel: '', xpiCrcHash: '' };
}

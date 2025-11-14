import { basename } from 'path';
import { createHash } from 'crypto';
import { createWriteStream, promises as fsPromises, readFileSync } from 'fs';
import { promises as streamPromises } from 'stream';

import { SignJWT } from 'jose';
import JSZip from 'jszip';
import { HttpsProxyAgent } from 'https-proxy-agent';

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
  apiProxy;
  apiUr;
  validationCheckInterval;
  validationCheckTimeout;
  approvalCheckInterval;
  approvalCheckTimeout;
  downloadDir;
  userAgentString;

  constructor({
    apiAuth,
    apiProxy,
    baseUrl,
    validationCheckInterval = 1000,
    validationCheckTimeout = 300000, // 5 minutes.
    approvalCheckInterval = 1000,
    approvalCheckTimeout = 900000, // 15 minutes.
    downloadDir = process.cwd(),
    userAgentString = 'web-ext-lib',
  }) {
    this.apiAuth = apiAuth;
    if (apiProxy) {
      this.apiProxy = apiProxy;
    }
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

  fileFromSync(filePath) {
    // create a File blob from a file path, and ensure it to have the file path basename
    // as the associated filename, the AMO server API will be checking it on the form-data
    // submitted and fail with the error message:
    // "Unsupported file type, please upload a supported file (.crx, .xpi, .zip)."
    const fileData = readFileSync(filePath);
    // eslint-disable-next-line no-shadow -- File is in Node v20.0.0+.
    let File = global.File;
    // TODO: Use the File global directly without the fallback when we drop
    // support for Node versions before v20.
    if (typeof File === 'undefined') {
      // Even without File being public, its interface and constructor could
      // be accessed indirectly from the FormData interface. According to the
      // FormData spec (that Node.js implements, via undici), the entry value
      // of a FormData is always a scalar value or a File:
      // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#form-entry-value
      const fd = new FormData();
      fd.set('x', new Blob([]));
      File = fd.get('x').constructor;
    }
    return new File([fileData], basename(filePath));
  }

  nodeFetch(url, { method, headers, body, agent }) {
    return fetch(url, { method, headers, body, agent });
  }

  async doUploadSubmit(xpiPath, channel) {
    const url = new URL('upload/', this.apiUrl);
    const formData = new FormData();
    formData.set('channel', channel);
    formData.set('upload', this.fileFromSync(xpiPath));
    const { uuid } = await this.fetchJson(
      url,
      'POST',
      formData,
      'Upload failed',
    );
    return this.waitForValidation(uuid);
  }

  waitRetry(
    successFunc,
    checkUrl,
    checkInterval,
    abortInterval,
    context,
    editUrl = null,
  ) {
    let checkTimeout;

    return new Promise((resolve, reject) => {
      const abortTimeout = setTimeout(() => {
        clearTimeout(checkTimeout);

        let errorMessage = `${context}: timeout exceeded.`;
        if (editUrl) {
          errorMessage += ` When approved the signed XPI file can be downloaded from ${editUrl}`;
        }

        reject(new Error(errorMessage));
      }, abortInterval);

      const pollStatus = async () => {
        try {
          const responseData = await this.fetchJson(
            checkUrl,
            'GET',
            undefined,
            'Getting details failed',
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
    log.info('Waiting for validation...');
    return this.waitRetry(
      (detailResponseData) => {
        if (!detailResponseData.processed) {
          return null;
        }

        log.debug('Validation results:', detailResponseData.validation);
        if (detailResponseData.valid) {
          return detailResponseData.uuid;
        }

        throw new Error(
          [
            'Validation failed:\n',
            JSON.stringify(detailResponseData.validation, null, 2),
          ].join(''),
        );
      },
      new URL(`upload/${uuid}/`, this.apiUrl),
      this.validationCheckInterval,
      this.validationCheckTimeout,
      'Validation',
    );
  }

  async doNewAddonSubmit(uuid, metaDataJson) {
    const url = new URL('addon/', this.apiUrl);
    const jsonData = {
      ...metaDataJson,
      version: { upload: uuid, ...metaDataJson.version },
    };
    return this.fetchJson(
      url,
      'POST',
      JSON.stringify(jsonData),
      'Submission failed (1)',
    );
  }

  doNewAddonOrVersionSubmit(addonId, uuid, metaDataJson) {
    const url = new URL(`addon/${addonId}/`, this.apiUrl);
    const jsonData = {
      ...metaDataJson,
      version: { upload: uuid, ...metaDataJson.version },
    };
    return this.fetchJson(
      url,
      'PUT',
      JSON.stringify(jsonData),
      'Submission failed (2)',
    );
  }

  async doFormDataPatch(data, addonId, versionId) {
    const patchUrl = new URL(
      `addon/${addonId}/versions/${versionId}/`,
      this.apiUrl,
    );
    try {
      const formData = new FormData();
      for (const field in data) {
        formData.set(field, data[field]);
      }

      const response = await this.fetch(patchUrl, 'PATCH', formData);
      if (!response.ok) {
        throw new Error(`response status was ${response.status}`);
      }
    } catch (error) {
      log.warn(`Upload of ${Object.keys(data)} failed: ${error}.`);
      throw new Error(`Uploading ${Object.keys(data)} failed`);
    }
  }

  async doAfterSubmit(addonId, newVersionId, editUrl, patchData) {
    if (patchData && patchData.version) {
      log.info(`Submitting ${Object.keys(patchData.version)} to version`);
      await this.doFormDataPatch(patchData.version, addonId, newVersionId);
    }

    if (this.approvalCheckTimeout === 0) {
      log.info(
        [
          'Waiting for approval and download of signed XPI skipped.',
          `When approved the signed XPI file can be downloaded from ${editUrl}`,
        ].join(' '),
      );
      return this.returnResult(addonId);
    }

    const fileUrl = new URL(
      await this.waitForApproval(addonId, newVersionId, editUrl),
    );
    return this.downloadSignedFile(fileUrl, addonId);
  }

  waitForApproval(addonId, versionId, editUrl) {
    log.info('Waiting for approval...');
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
      'Approval',
      editUrl,
    );
  }

  async fetchJson(url, method = 'GET', body, errorMsg = 'Bad Request') {
    const response = await this.fetch(url, method, body);
    if (response.status < 200 || response.status >= 500) {
      throw new Error(
        `${errorMsg}: ${response.statusText || response.status}.`,
      );
    }
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        [
          `${errorMsg}: ${response.statusText || response.status}`,
          JSON.stringify(data, null, 2),
        ].join('\n'),
      );
    }
    return data;
  }

  async fetch(url, method = 'GET', body) {
    log.debug(`${method}ing URL: ${url.href}`);
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
    let agent;
    if (this.apiProxy) {
      agent = new HttpsProxyAgent(this.apiProxy);
    }
    return this.nodeFetch(url, { method, body, headers, agent });
  }

  returnResult(addonId, downloadedFiles) {
    return {
      id: addonId,
      downloadedFiles,
    };
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
    log.info(`Signed xpi downloaded: ${dest}`);
    return this.returnResult(addonId, [filename]);
  }

  async saveToFile(contents, destPath) {
    return streamPromises.pipeline(contents, createWriteStream(destPath));
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
      asyncFsReadFile(filePath, { createFolders: true }),
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
    getUploadUuidFromFileFunc = getUploadUuidFromFile,
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
    patchData,
    saveIdToFileFunc = saveIdToFile,
  ) {
    const {
      guid: addonId,
      version: { id: newVersionId, edit_url: editUrl },
    } = await this.doNewAddonSubmit(uploadUuid, metaDataJson);

    await saveIdToFileFunc(savedIdPath, addonId);
    log.info(`Generated extension ID: ${addonId}.`);
    log.info('You must add the following to your manifest:');
    log.info(`"browser_specific_settings": {"gecko": {"id": "${addonId}"}}`);

    return this.doAfterSubmit(addonId, newVersionId, editUrl, patchData);
  }

  async putVersion(uploadUuid, addonId, metaDataJson, patchData) {
    const {
      version: { id: newVersionId, edit_url: editUrl },
    } = await this.doNewAddonOrVersionSubmit(addonId, uploadUuid, metaDataJson);

    return this.doAfterSubmit(addonId, newVersionId, editUrl, patchData);
  }
}

export async function signAddon({
  apiKey,
  apiSecret,
  apiProxy,
  amoBaseUrl,
  validationCheckTimeout,
  approvalCheckTimeout,
  id,
  xpiPath,
  downloadDir,
  channel,
  savedIdPath,
  savedUploadUuidPath,
  metaDataJson = {},
  submissionSource,
  userAgentString = 'web-ext-lib',
  SubmitClient = Client,
  ApiAuthClass = JwtApiAuth,
}) {
  try {
    const stats = await fsPromises.stat(xpiPath);

    if (!stats.isFile()) {
      throw new Error('not a file');
    }
  } catch (statError) {
    throw new Error(`error with ${xpiPath}: ${statError}`);
  }

  let baseUrl;
  try {
    baseUrl = new URL(amoBaseUrl);
  } catch {
    throw new Error(`Invalid AMO API base URL: ${amoBaseUrl}`);
  }

  const client = new SubmitClient({
    apiAuth: new ApiAuthClass({ apiKey, apiSecret }),
    apiProxy,
    baseUrl,
    validationCheckTimeout,
    approvalCheckTimeout,
    downloadDir,
    userAgentString,
  });
  const uploadUuid = await client.getPreviousUuidOrUploadXpi(
    xpiPath,
    channel,
    savedUploadUuidPath,
  );
  const patchData = {};
  // if we have a source file we need to upload we patch after the create
  if (submissionSource) {
    try {
      const stats2 = await fsPromises.stat(submissionSource);

      if (!stats2.isFile()) {
        throw new Error('not a file');
      }
    } catch (statError) {
      throw new Error(`error with ${submissionSource}: ${statError}`);
    }
    patchData.version = { source: client.fileFromSync(submissionSource) };
  }

  // We specifically need to know if `id` has not been passed as a parameter because
  // it's the indication that a new add-on should be created, rather than a new version.
  if (id === undefined) {
    return client.postNewAddon(
      uploadUuid,
      savedIdPath,
      metaDataJson,
      patchData,
    );
  }

  return client.putVersion(uploadUuid, id, metaDataJson, patchData);
}

export async function saveIdToFile(filePath, id) {
  await fsPromises.writeFile(
    filePath,
    [
      '# This file was created by https://github.com/mozilla/web-ext',
      '# Your auto-generated extension ID for addons.mozilla.org is:',
      id.toString(),
    ].join('\n'),
  );

  log.debug(`Saved auto-generated ID ${id} to ${filePath}`);
}

export async function saveUploadUuidToFile(
  filePath,
  { uploadUuid, channel, xpiCrcHash },
) {
  await fsPromises.writeFile(
    filePath,
    JSON.stringify({ uploadUuid, channel, xpiCrcHash }),
  );
  log.debug(
    `Saved upload UUID ${uploadUuid}, xpi crc hash ${xpiCrcHash}, and channel ${channel} to ${filePath}`,
  );
}

export async function getUploadUuidFromFile(
  filePath,
  asyncFsReadFile = defaultAsyncFsReadFile,
) {
  try {
    const content = await asyncFsReadFile(filePath, 'utf-8');
    const { uploadUuid, channel, xpiCrcHash } = JSON.parse(content);
    log.debug(
      `Found upload uuid:${uploadUuid}, channel:${channel}, hash:${xpiCrcHash} in ${filePath}`,
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

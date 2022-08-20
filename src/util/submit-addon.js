/* @flow */
import { createWriteStream, promises as fsPromises } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

// eslint-disable-next-line no-shadow
import fetch, { FormData, fileFromSync, Response } from 'node-fetch';
import { SignJWT } from 'jose';

import {createLogger} from './../util/logger.js';

const log = createLogger(import.meta.url);

export type SignResult = {|
  id: string,
  downloadedFiles: Array<string>,
|};

type ClientConstructorParams = {|
  apiKey: string,
  apiSecret: string,
  apiHost: string,
  apiJwtExpiresIn?: number,
  validationCheckInterval?: number,
  validationCheckTimeout?: number,
  approvalCheckInterval?: number,
  approvalCheckTimeout?: number,
  downloadDir?: string,
|};

export default class Client {
  apiKey: string;
  apiSecret: string;
  apiUrl: string;
  apiJwtExpiresIn: number;
  validationCheckInterval: number;
  validationCheckTimeout: number;
  approvalCheckInterval: number;
  approvalCheckTimeout: number;
  downloadDir: string;

  constructor({
    apiKey,
    apiSecret,
    apiHost,
    apiJwtExpiresIn = 60 * 5, // 5 minutes
    validationCheckInterval = 1000,
    validationCheckTimeout = 300000, // 5 minutes.
    approvalCheckInterval = 1000,
    approvalCheckTimeout = 900000, // 15 minutes.
    downloadDir = process.cwd(),
  }: ClientConstructorParams) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.apiUrl = `${apiHost}/api/v5/addons/`;
    this.apiJwtExpiresIn = apiJwtExpiresIn;
    this.validationCheckInterval = validationCheckInterval;
    this.validationCheckTimeout = validationCheckTimeout;
    this.approvalCheckInterval = approvalCheckInterval;
    this.approvalCheckTimeout = approvalCheckTimeout;
    this.downloadDir = downloadDir;
  }

  fileFromSync(path: string): File {
    return fileFromSync(path);
  }

  nodeFetch(
    url: string,
    { method, headers, body }: {
      method: string,
      headers: { [key: string]: string },
      body?: typeof FormData | string
    }
  ): Promise<typeof Response> {
    return fetch(url, { method, headers, body });
  }

  async doUploadSubmit(xpiPath: string, channel: string): Promise<string> {
    const url = `${this.apiUrl}upload/`;
    const formData = new FormData();
    formData.set('channel', channel);
    formData.set('upload', this.fileFromSync(xpiPath));
    const { uuid } = await this.fetchJson(url, 'POST', formData);
    return this.waitForValidation(uuid);
  }

  waitRetry(
    successFunc: (detailResponseData: any) => string | null,
    checkUrl: string,
    checkInterval: number,
    abortInterval: number,
    context: string,
  ): Promise<string> {
    let checkTimeout;

    return new Promise((resolve, reject) => {
      const abortTimeout = setTimeout(() => {
        clearTimeout(checkTimeout);
        reject(new Error(`${context}: timeout.`));
      }, abortInterval);

      const pollStatus = async () => {
        try {
          const responseData = await this.fetchJson(
            checkUrl, 'GET', undefined, 'Getting details failed.');

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

  waitForValidation(uuid: string): Promise<string> {
    log.info('Waiting for Validation...');
    return this.waitRetry(
      (detailResponseData): string | null => {
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
      `${this.apiUrl}upload/${uuid}/`,
      this.validationCheckInterval,
      this.validationCheckTimeout,
      'Validation',
    );
  }

  async doNewAddonSubmit(uuid: string, metaDataJson: Object): Promise<any> {
    const url = `${this.apiUrl}addon/`;
    const jsonData = { version: { upload: uuid }, ...metaDataJson };
    return this.fetchJson(url, 'POST', JSON.stringify(jsonData));
  }

  doNewAddonOrVersionSubmit(
    addonId: string,
    uuid: string,
    metaDataJson: Object,
  ): Promise<typeof Response> {
    const url = `${this.apiUrl}addon/${addonId}/`;
    const jsonData = { version: { upload: uuid }, ...metaDataJson };
    return this.fetch(url, 'PUT', JSON.stringify(jsonData));
  }

  waitForApproval(addonId: string, versionId: number): Promise<string> {
    log.info('Waiting for Approval...');
    return this.waitRetry(
      (detailResponseData): string | null => {
        const {file} = detailResponseData;
        if (file && file.status === 'public') {
          return file.url;
        }

        return null;
      },
      `${this.apiUrl}addon/${addonId}/versions/${versionId}/`,
      this.approvalCheckInterval,
      this.approvalCheckTimeout,
      'Approval',
    );
  }

  async fetchJson(
    url: string,
    method: string = 'GET',
    body?: typeof FormData | string,
    errorMsg: string = 'Bad Request'
  ): Promise<any> {
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
        `${errorMsg}: ${response.statusText || response.status}.`);
    }
    return data;
  }

  async signJWT(): Promise<string> {
    return new SignJWT({ iss: this.apiKey })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      // jose expects either:
      // a number, which is treated an absolute timestamp - so must be after now, or
      // a string, which is parsed as a relative time from now.
      .setExpirationTime(`${this.apiJwtExpiresIn}seconds`)
      .sign(Uint8Array.from(Buffer.from(this.apiSecret, 'utf8')));
  }

  async fetch(
    url: string,
    method: string = 'GET',
    body?: typeof FormData | string,
  ): Promise<typeof Response> {
    const authToken = await this.signJWT();

    log.info(`Fetching URL: ${url}`);
    let headers = {
      Authorization: `JWT ${authToken}`,
      Accept: 'application/json',
    };
    if (typeof body === 'string') {
      headers = {
        ...headers,
        'Content-Type': 'application/json',
      };
    }
    return this.nodeFetch(url, { method, body, headers });
  }

  async downloadSignedFile(
    fileUrl: string,
    addonId: string
  ): Promise<SignResult> {
    const filename = fileUrl.split('/').pop(); // get the name from fileUrl
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

  async saveToFile(
    contents: typeof Response.body, destPath: string): Promise<any> {
    return promisify(pipeline)(contents, createWriteStream(destPath));
  }

  async postNewAddon(
    xpiPath: string,
    channel: string,
    metaDataJson: Object
  ): Promise<SignResult> {
    const uploadUuid = await this.doUploadSubmit(xpiPath, channel);

    const versionObject =
      channel === 'listed' ? 'current_version' : 'latest_unlisted_version';
    const {
      guid: addonId,
      [versionObject]: {id: newVersionId},
    } = await this.doNewAddonSubmit(uploadUuid, metaDataJson);

    const fileUrl = await this.waitForApproval(addonId, newVersionId);

    return this.downloadSignedFile(fileUrl, addonId);
  }

  async putVersion(
    xpiPath: string,
    channel: string,
    addonId: string,
    metaDataJson: Object
  ): Promise<SignResult> {
    const uploadUuid = await this.doUploadSubmit(xpiPath, channel);

    await this.doNewAddonOrVersionSubmit(addonId, uploadUuid, metaDataJson);

    const url =
      `${this.apiUrl}addon/${addonId}/versions/?filter=all_with_unlisted`;
    const {results: [{id: newVersionId}]} = await this.fetchJson(url);

    const fileUrl = await this.waitForApproval(addonId, newVersionId);

    return this.downloadSignedFile(fileUrl, addonId);
  }
}

type signAddonParams = {|
  apiKey: string,
  apiSecret: string,
  apiHost: string,
  timeout: number,
  id?: string,
  xpiPath: string,
  downloadDir: string,
  channel: string,
  SubmitClient?: typeof Client,
|}

export async function signAddon({
  apiKey,
  apiSecret,
  apiHost,
  timeout,
  id,
  xpiPath,
  downloadDir,
  channel,
  SubmitClient = Client,
}: signAddonParams): Promise<SignResult> {
  try {
    const stats = await fsPromises.stat(xpiPath);

    if (!stats.isFile()) {
      throw new Error(`not a file: ${xpiPath}`);
    }
  } catch (statError) {
    throw new Error(`error with ${xpiPath}: ${statError}`);
  }

  const client = new SubmitClient({
    apiKey,
    apiSecret,
    apiHost,
    validationCheckTimeout: timeout,
    approvalCheckTimeout: timeout,
    downloadDir,
  });

  // We specifically need to know if `id` has not been passed as a parameter because
  // it's the indication that a new add-on should be created, rather than a new version.
  if (id === undefined) {
    return client.postNewAddon(xpiPath, channel, {});
  }

  return client.putVersion(xpiPath, channel, id, {});
}

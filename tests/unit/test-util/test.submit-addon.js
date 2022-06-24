/* @flow */
import { promises as fsPromises, readFileSync } from 'fs';
import path from 'path';

import { fs } from 'mz';
import { assert, expect } from 'chai';
import { afterEach, before, beforeEach, describe, it } from 'mocha';
import * as sinon from 'sinon';
import nock from 'nock';
import { File, FormData } from 'node-fetch';

import Client, { signAddon } from '../../../src/util/submit-addon.js';
import { withTempDir } from '../../../src/util/temp-dir.js';

describe('util.submit-addon', () => {

  describe('signAddon', () => {
    let statStub;
    let postNewAddonStub;
    let putVersionStub;

    beforeEach(() => {
      statStub = sinon.stub(fsPromises, 'stat')
        .resolves({isFile: () => true });
      postNewAddonStub = sinon.stub(Client.prototype, 'postNewAddon');
      putVersionStub = sinon.stub(Client.prototype, 'putVersion');
    });

    afterEach(() => {
      statStub.restore();
      postNewAddonStub.restore();
      putVersionStub.restore();
    });

    const signAddonDefaults = {
      apiKey: 'some-key',
      apiSecret: 'ffff',
      apiHost: 'https://some.url',
      timeout: 1,
      downloadDir: '/some-dir/',
      xpiPath: '/some.xpi',
      channel: 'some-channel',
    };

    it('creates Client with parameters', async () => {
      const apiKey = 'fooKey';
      const apiSecret = '4321';
      const apiHost = 'fooPrefix';
      const downloadDir = '/foo';
      const clientSpy = sinon.spy(Client);

      await signAddon({
        ...signAddonDefaults,
        apiKey,
        apiSecret,
        apiHost,
        downloadDir,
        SubmitClient: clientSpy,
      });

      sinon.assert.calledOnce(clientSpy);
      assert.deepEqual(
        clientSpy.firstCall.args[0], {
          apiKey,
          apiSecret,
          apiHost,
          validationCheckTimeout: signAddonDefaults.timeout,
          approvalCheckTimeout: signAddonDefaults.timeout,
          downloadDir,
        }
      );
    });

    it('calls postNewAddon if `id` is undefined', async () => {
      const xpiPath = 'this/path/xpi.xpi';
      const channel = 'thisChannel';
      await signAddon({
        ...signAddonDefaults,
        xpiPath,
        channel,
      });
      sinon.assert.notCalled(putVersionStub);
      sinon.assert.calledWith(postNewAddonStub, xpiPath, channel, {});
    });

    it('calls putVersion if `id` is defined', async () => {
      const xpiPath = 'this/path/xpi.xpi';
      const channel = 'thisChannel';
      const id = '@thisID';
      await signAddon({
        ...signAddonDefaults,
        xpiPath,
        channel,
        id,
      });
      sinon.assert.notCalled(postNewAddonStub);
      sinon.assert.calledWith(putVersionStub, xpiPath, channel, id, {});
    });

    it('throws error if xpiPath is invalid', async () => {
      statStub.restore();
      const signAddonPromise = signAddon(signAddonDefaults);
      await assert.isRejected(
        signAddonPromise,
        `error with ${signAddonDefaults.xpiPath}: ` +
        'Error: ENOENT: no such file or directory'
      );
    });
  });

  describe('Client', () => {
    const apiHost = 'http://not-a-real-amo-api.com';
    const apiPath = '/api/v5';

    const clientDefaults = {
      apiKey: 'fake-api-key',
      apiSecret: '1234abcd',
      apiHost,
      approvalCheckInterval: 0,
      validationCheckInterval: 0,
    };

    const sampleUploadDetail = {
      uuid: '1234-5678',
      channel: 'a-channel',
      processed: true,
      submitted: false,
      url: 'http://amo/validation-results/',
      valid: true,
      validation: {},
      version: '1.0',
    };

    const sampleVersionDetail = {
      // Note: most of the fields are omitted here, these are just the essentials.
      id: 456,
      channel: 'a-channel',
      file: {
        id: 789,
        hash: 'abcd',
        status: 'nominated',
        url: 'http://amo/download-url',
      },
      version: '1.0',
    };
    const sampleVersionDetail2 = {...sampleVersionDetail, id: 457};

    const sampleAddonDetail = {
      // Note: most of the fields are ommited here, these are just the essentials.
      id: 9876,
      current_version: sampleVersionDetail,
      latest_unlisted_version: sampleVersionDetail2,
      guid: '@this-guid',
      slug: 'this_addon',
      status: 'unreviewed',
    };

    describe('doUploadSubmit', () => {
      afterEach(() => {
        nock.cleanAll();
      });

      it('submits the xpi', async () => {
        const client = new Client(clientDefaults);
        sinon.stub(client, 'fileFromSync')
          .returns(new File([], 'foo.xpi'));
        nock(apiHost)
          .post(`${apiPath}/addons/upload/`)
          .reply(200, sampleUploadDetail);
        const xpiPath = '/some/path.xpi';
        const channel = 'someChannel';
        const waitStub = sinon.stub(client, 'waitForValidation')
          .resolves(sampleUploadDetail.uuid);

        const returnUuid = await client.doUploadSubmit(xpiPath, channel);
        assert.equal(sampleUploadDetail.uuid, returnUuid);
        sinon.assert.calledWith(waitStub, sampleUploadDetail.uuid);
      });
    });

    describe('waitForValidation', () => {
      afterEach(() => {
        nock.cleanAll();
      });

      it('aborts validation check after timeout', async () => {
        const client = new Client({
          ...clientDefaults,
          // This causes an immediate failure.
          validationCheckTimeout: 0,
          validationCheckInterval: 1,
        });
        const uploadUuid = '@some-guid';
        nock(apiHost)
          .get(`${apiPath}/addons/upload/${uploadUuid}/`)
          .reply(200, {});

        const clientPromise = client.waitForValidation(uploadUuid);
        await assert.isRejected(clientPromise, 'Validation: timeout.');
      });

      it('waits for validation that passes', async () => {
        const client = new Client({
          ...clientDefaults,
          validationCheckTimeout: 1000,
          validationCheckInterval: 1,
        });
        const uploadUuid = '@some-guid';
        nock(apiHost)
          .get(`${apiPath}/addons/upload/${uploadUuid}/`).times(2)
          .reply(200, {})
          .get(`${apiPath}/addons/upload/${uploadUuid}/`)
          .reply(200, {processed: true, valid: true, uuid: uploadUuid});

        const returnUuid = await client.waitForValidation(uploadUuid);
        assert.equal(returnUuid, uploadUuid);
      });

      it('waits for validation that fails', async () => {
        const client = new Client({
          ...clientDefaults,
          validationCheckTimeout: 1000,
          validationCheckInterval: 1,
        });
        const uploadUuid = '@some-guid';
        const validationUrl = `${apiHost}/to/validation/report`;
        nock(apiHost)
          .get(`${apiPath}/addons/upload/${uploadUuid}/`).times(2)
          .reply(200, {})
          .get(`${apiPath}/addons/upload/${uploadUuid}/`)
          .reply(200, {processed: true, valid: false, url: validationUrl});

        const clientPromise = client.waitForValidation(uploadUuid);
        await assert.isRejected(clientPromise, validationUrl);
      });
    });

    describe('doNewAddonSubmit', () => {
      afterEach(() => {
        nock.cleanAll();
      });

      it('posts the upload uuid', async () => {
        const client = new Client(clientDefaults);
        nock(apiHost)
          .post(`${apiPath}/addons/addon/`).reply(202, sampleAddonDetail);
        const uploadUuid = 'some-uuid';

        const returnData = await client.doNewAddonSubmit(uploadUuid, {});
        expect(returnData).to.eql(sampleAddonDetail);
      });
    });

    describe('doNewAddonOrVersionSubmit', () => {
      afterEach(() => {
        nock.cleanAll();
      });

      it('puts the upload uuid to the addon detail', async () => {
        const client = new Client(clientDefaults);
        const guid = '@some-addon-guid';
        nock(apiHost)
          .put(`${apiPath}/addons/addon/${guid}/`)
          .reply(202, sampleAddonDetail);
        const uploadUuid = 'some-uuid';

        await client.doNewAddonOrVersionSubmit(guid, uploadUuid, {});
      });
    });

    describe('waitForApproval', () => {
      afterEach(() => {
        nock.cleanAll();
      });

      it('aborts approval wait after timeout', async () => {
        const client = new Client({
          ...clientDefaults,
          // This causes an immediate failure.
          approvalCheckTimeout: 0,
          approvalCheckInterval: 1,
        });
        const addonId = '@random-addon';
        const versionId = 0;
        const detailPath =
          `${apiPath}/addons/addon/${addonId}/versions/${versionId}/`;

        nock(apiHost).get(detailPath).reply(200, {});

        const clientPromise = client.waitForApproval(addonId, versionId);
        await assert.isRejected(clientPromise, 'Approval: timeout.');
      });

      it('waits for approval', async () => {
        const client = new Client({
          ...clientDefaults,
          validationCheckTimeout: 1000,
          validationCheckInterval: 1,
        });
        const addonId = '@random-addon';
        const versionId = 0;
        const detailPath =
          `${apiPath}/addons/addon/${addonId}/versions/${versionId}/`;
        const url = `${apiHost}file/download/url`;
        nock(apiHost)
          .get(detailPath).reply(200, {})
          .get(detailPath).reply(200, {file: {status: 'nominated'}})
          .get(detailPath).reply(200, {file: {status: 'public', url}});

        const fileUrl = await client.waitForApproval(addonId, versionId);
        assert.equal(fileUrl, url);
      });
    });

    describe('downloadSignedFile', () => {
      const filename = 'download.xpi';
      const filePath = `/path/to/${filename}`;
      const fileUrl = `${apiHost}${filePath}`;
      const addonId = '@some-addon-id';

      afterEach(() => {
        nock.cleanAll();
      });

      it('downloads the file to tmpdir', () => withTempDir(async (tmpDir) => {
        const client = new Client(
          { ...clientDefaults, downloadDir: tmpDir.path() },
        );
        const fileData = 'a';

        nock(apiHost).get(filePath).reply(200, fileData);

        const result = await client.downloadSignedFile(fileUrl, addonId);
        expect(result).to.eql({
          id: addonId,
          downloadedFiles: [filename],
        });
        const fullPath = path.join(tmpDir.path(), filename);
        const stat = await fs.stat(fullPath);
        assert.equal(stat.isFile(), true);
        assert.equal(readFileSync(fullPath), fileData);
      }));

      it('raises when the response is not ok', async () => {
        const client = new Client(clientDefaults);
        nock(apiHost).get(filePath).reply(404, 'a');

        const clientPromise = client.downloadSignedFile(fileUrl, addonId);
        await assert.isRejected(
          clientPromise, `Downloading ${filename} failed`
        );
      });

      it('raises a consistent error when fetch raises', async () => {
        const client = new Client(clientDefaults);
        sinon.stub(client, 'fetch').rejects(new Error('some fetch error'));

        const clientPromise = client.downloadSignedFile(fileUrl, addonId);
        await assert.isRejected(
          clientPromise, `Downloading ${filename} failed`
        );
      });

      it('raises a consistent error when saveToFile raises', async () => {
        const client = new Client(clientDefaults);
        nock(apiHost).get(filePath).reply(200, 'a');
        sinon.stub(client, 'saveToFile').rejects(new Error('some save error'));

        const clientPromise = client.downloadSignedFile(fileUrl, addonId);
        await assert.isRejected(
          clientPromise, `Downloading ${filename} failed`
        );
      });
    });

    describe('postNewAddon and putVersion', () => {
      const client = new Client(clientDefaults);
      const xpiPath = 'foo.xpi';
      const downloadPath = '/some/file.xpi';
      const uploadUuid = sampleUploadDetail.uuid;
      const addonId = sampleAddonDetail.guid;

      before(() => {
        sinon.stub(client, 'fileFromSync').returns(new File([], xpiPath));
        sinon.stub(client, 'saveToFile').resolves();
      });

      afterEach(() => {
        nock.cleanAll();
      });

      const addUploadNocks = () => {
        nock(apiHost)
          .post(`${apiPath}/addons/upload/`)
          .reply(200, sampleUploadDetail)
          .get(`${apiPath}/addons/upload/${uploadUuid}/`)
          .reply(200, {processed: true, valid: true, uuid: uploadUuid});
      };

      const addApprovalNocks = (versionId) => {
        const url = `${apiHost}${downloadPath}`;
        nock(apiHost)
          .get(`${apiPath}/addons/addon/${addonId}/versions/${versionId}/`)
          .reply(200, {file: {status: 'public', url}})
          .get(downloadPath)
          .reply(200, `${versionId}`);
      };

      [
        {channel: 'listed', versionId: sampleVersionDetail.id},
        {channel: 'unlisted', versionId: sampleVersionDetail2.id},
      ].forEach(({channel, versionId}) =>
        it('uploads new listed add-on; downloads the signed xpi', async () => {
          addUploadNocks();
          nock(apiHost)
            .post(`${apiPath}/addons/addon/`)
            .reply(200, sampleAddonDetail);
          addApprovalNocks(versionId);

          await client.postNewAddon(xpiPath, channel, {});
        }));

      it('uploads a new version; then downloads the signed xpi', async () => {
        const channel = 'listed';
        const versionId = sampleVersionDetail.id;
        const query = '?filter=all_with_unlisted';

        addUploadNocks();
        nock(apiHost)
          .put(`${apiPath}/addons/addon/${addonId}/`)
          .reply(200, sampleAddonDetail)
          .get(`${apiPath}/addons/addon/${addonId}/versions/${query}`)
          .reply(200, {results: [sampleVersionDetail]});
        addApprovalNocks(versionId);

        await client.putVersion(xpiPath, channel, `${addonId}`, {});
      });
    });

    describe('fetchJson', () => {
      const client = new Client(clientDefaults);

      afterEach(() => {
        nock.cleanAll();
      });

      it('rejects with a promise on not ok responses', async () => {
        nock(apiHost).get('/').reply(400, {});

        const clientPromise = client.fetchJson(`${apiHost}/`);
        await assert.isRejected(clientPromise, 'Bad Request: 400.');
      });

      it('rejects with a promise on < 100 responses', async () => {
        nock(apiHost).get('/').reply(99, {});

        const clientPromise = client.fetchJson(`${apiHost}/`);
        await assert.isRejected(clientPromise, 'Bad Request: 99.');
      });

      it('rejects with a promise on >= 500 responses', async () => {
        nock(apiHost).get('/').reply(500, {});

        const clientPromise = client.fetchJson(`${apiHost}/`);
        await assert.isRejected(clientPromise, 'Bad Request: 500.');
      });

      it('resolves with a promise containing response json', async () => {
        const nockJson = {thing: ['other'], this: {that: 1}};
        nock(apiHost).get('/').reply(200, nockJson);

        const responseJson = await client.fetchJson(`${apiHost}/`);

        expect(responseJson).to.eql(nockJson);
      });
    });

    describe('fetch', () => {
      const client = new Client(clientDefaults);
      let jwtSignSpy;
      const reqheaders = {
        Authorization: async (headerValue) =>
          headerValue === `JWT ${await jwtSignSpy.firstCall.returnValue}`,
        Accept: 'application/json',
      };

      beforeEach(() => {
        jwtSignSpy = sinon.spy(client, 'signJWT');
      });

      afterEach(() => {
        jwtSignSpy.restore();
        nock.cleanAll();
      });

      it('sets json content type for string type body', async () => {
        nock(apiHost, {
          reqheaders: {...reqheaders, 'Content-Type': 'application/json'},
        }).post('/').reply(200, {});

        // nock would error if the headers don't match
        await client.fetch(`${apiHost}/`, 'POST', 'body');
      });

      it("doesn't set content type for FormData type body", async () => {
        nock(apiHost, {reqheaders}).post('/').reply(200, {});

        // nock would error if the headers don't match
        await client.fetch(`${apiHost}/`, 'POST', new FormData());
      });

      it("doesn't set content type for no body", async () => {
        nock(apiHost, {reqheaders}).post('/').reply(200, {});

        // nock would error if the headers don't match
        await client.fetch(`${apiHost}/`, 'POST');
      });
    });
  });
});

/* @flow */
import { promises as fsPromises, readFileSync } from 'fs';
import path from 'path';

import { fs } from 'mz';
import { assert, expect } from 'chai';
import { afterEach, before, beforeEach, describe, it } from 'mocha';
import * as sinon from 'sinon';
import { File, FormData, Response } from 'node-fetch';

import Client, { signAddon } from '../../../src/util/submit-addon.js';
import { withTempDir } from '../../../src/util/temp-dir.js';

class JSONResponse extends Response {
  constructor(data, status) {
    super(JSON.stringify(data), {status});
  }
}

const mockNodeFetch = (
  nodeFetchStub: any,
  url: string,
  method: string,
  responses: Array<{
    body: any,
    status: number,
  }>
): void => {
  const stubMatcher = nodeFetchStub.withArgs(
    url,
    sinon.match.has('method', method)
  );
  for (let i = 0; i < responses.length; i++) {
    const { body, status } = responses[i];
    stubMatcher
      .onCall(i)
      .callsFake(async () => {
        if (typeof body === 'string') {
          return new Response(body, { status });
        }
        return new JSONResponse(body, status);
      });
  }
  return stubMatcher;
};

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
    const apiHostPath = `${apiHost}${apiPath}`;

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
      it('submits the xpi', async () => {
        const client = new Client(clientDefaults);
        sinon.stub(client, 'fileFromSync')
          .returns(new File([], 'foo.xpi'));
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHostPath}/addons/upload/`,
          'POST',
          [
            {
              body: sampleUploadDetail,
              status: 200,
            },
          ]
        );

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
      it('aborts validation check after timeout', async () => {
        const client = new Client({
          ...clientDefaults,
          // This causes an immediate failure.
          validationCheckTimeout: 0,
          validationCheckInterval: 1,
        });
        const uploadUuid = '@some-guid';
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHostPath}/addons/upload/${uploadUuid}/`,
          'GET',
          [
            {
              body: {},
              status: 200,
            },
          ]
        );

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
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHostPath}/addons/upload/${uploadUuid}/`,
          'GET',
          [
            { body: {}, status: 200 },
            { body: {}, status: 200 },
            {
              body: { processed: true, valid: true, uuid: uploadUuid },
              status: 200,
            },
          ]
        );

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
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHostPath}/addons/upload/${uploadUuid}/`,
          'GET',
          [
            { body: {}, status: 200 },
            { body: {}, status: 200 },
            {
              body: { processed: true, valid: false, url: validationUrl },
              status: 200,
            },
          ]
        );


        const clientPromise = client.waitForValidation(uploadUuid);
        await assert.isRejected(clientPromise, validationUrl);
      });
    });

    describe('doNewAddonSubmit', () => {
      it('posts the upload uuid', async () => {
        const client = new Client(clientDefaults);
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHostPath}/addons/addon/`,
          'POST',
          [
            { body: sampleAddonDetail, status: 202 },
          ]
        );
        const uploadUuid = 'some-uuid';
        const returnData = await client.doNewAddonSubmit(uploadUuid, {});
        expect(returnData).to.eql(sampleAddonDetail);
      });
    });

    describe('doNewAddonOrVersionSubmit', () => {
      it('puts the upload uuid to the addon detail', async () => {
        const client = new Client(clientDefaults);
        const guid = '@some-addon-guid';
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHostPath}/addons/addon/${guid}/`,
          'POST',
          [
            { body: sampleAddonDetail, status: 202 },
          ]
        );
        const uploadUuid = 'some-uuid';
        await client.doNewAddonOrVersionSubmit(guid, uploadUuid, {});
      });
    });

    describe('waitForApproval', () => {
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
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHost}${detailPath}`,
          'GET',
          [{ body: {}, status: 200 }]
        );
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
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHost}${detailPath}`,
          'GET',
          [
            { body: {}, status: 200 },
            { body: {}, status: 200 },
            { body: { file: { status: 'public', url } }, status: 200 },
          ]
        );
        const fileUrl = await client.waitForApproval(addonId, versionId);
        assert.equal(fileUrl, url);
      });
    });

    describe('downloadSignedFile', () => {
      const filename = 'download.xpi';
      const filePath = `/path/to/${filename}`;
      const fileUrl = `${apiHost}${filePath}`;
      const addonId = '@some-addon-id';

      it('downloads the file to tmpdir', () => withTempDir(async (tmpDir) => {
        const client = new Client(
          { ...clientDefaults, downloadDir: tmpDir.path() },
        );
        const fileData = 'a';

        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHost}${filePath}`,
          'GET',
          [{ body: fileData, status: 200 }]
        );

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

        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHost}${filePath}`,
          'GET',
          [{ body: 'a', status: 404 }]
        );

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

        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          `${apiHost}${filePath}`,
          'GET',
          [{ body: 'a', status: 200 }]
        );

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

      let nodeFetchStub;

      before(() => {
        sinon.stub(client, 'fileFromSync').returns(new File([], xpiPath));
        sinon.stub(client, 'saveToFile').resolves();
        nodeFetchStub = sinon.stub(client, 'nodeFetch');
      });

      afterEach(() => {
        nodeFetchStub.reset();
      });

      const addUploadMocks = () => {
        mockNodeFetch(
          nodeFetchStub,
          `${apiHostPath}/addons/upload/`,
          'POST',
          [{ body: sampleUploadDetail, status: 200 }]
        );
        mockNodeFetch(
          nodeFetchStub,
          `${apiHostPath}/addons/upload/${uploadUuid}/`,
          'GET',
          [
            {
              body: { processed: true, valid: true, uuid: uploadUuid },
              status: 200,
            },
          ]
        );
      };

      const addApprovalMocks = (versionId) => {
        const url = `${apiHost}${downloadPath}`;
        mockNodeFetch(
          nodeFetchStub,
          `${apiHostPath}/addons/addon/${addonId}/versions/${versionId}/`,
          'GET',
          [
            {
              body: { file: { status: 'public', url } },
              status: 200,
            },
          ]
        );
        mockNodeFetch(
          nodeFetchStub,
          url,
          'GET',
          [{ body: `${versionId}`, status: 200 }]
        );
      };

      [
        {channel: 'listed', versionId: sampleVersionDetail.id},
        {channel: 'unlisted', versionId: sampleVersionDetail2.id},
      ].forEach(({channel, versionId}) =>
        it('uploads new listed add-on; downloads the signed xpi', async () => {
          addUploadMocks();
          mockNodeFetch(
            nodeFetchStub,
            `${apiHostPath}/addons/addon/`,
            'POST',
            [{ body: sampleAddonDetail, status: 200 }]
          );
          addApprovalMocks(versionId);
          await client.postNewAddon(xpiPath, channel, {});
        }));

      it('uploads a new version; then downloads the signed xpi', async () => {
        const channel = 'listed';
        const versionId = sampleVersionDetail.id;
        const query = '?filter=all_with_unlisted';

        addUploadMocks();

        mockNodeFetch(
          nodeFetchStub,
          `${apiHostPath}/addons/addon/${addonId}/`,
          'PUT',
          [{ body: sampleAddonDetail, status: 200 }]
        );
        mockNodeFetch(
          nodeFetchStub,
          `${apiHostPath}/addons/addon/${addonId}/versions/${query}`,
          'GET',
          [
            {
              body: { results: [sampleVersionDetail] },
              status: 200,
            },
          ]
        );

        addApprovalMocks(versionId);

        await client.putVersion(xpiPath, channel, `${addonId}`, {});
      });
    });

    describe('fetchJson', () => {
      const client = new Client(clientDefaults);
      const nodeFetchStub = sinon.stub(client, 'nodeFetch');

      afterEach(() => {
        nodeFetchStub.reset();
      });

      it('rejects with a promise on not ok responses', async () => {
        mockNodeFetch(
          nodeFetchStub,
          `${apiHost}/`,
          'GET',
          [{ body: {}, status: 400 }]
        );
        const clientPromise = client.fetchJson(`${apiHost}/`);
        await assert.isRejected(clientPromise, 'Bad Request: 400.');
      });

      it('rejects with a promise on < 100 responses', async () => {
        mockNodeFetch(
          nodeFetchStub,
          `${apiHost}/`,
          'GET',
          [{ body: {}, status: 99 }]
        );
        const clientPromise = client.fetchJson(`${apiHost}/`);
        await assert.isRejected(clientPromise, 'Bad Request: 99.');
      });

      it('rejects with a promise on >= 500 responses', async () => {
        mockNodeFetch(
          nodeFetchStub,
          `${apiHost}/`,
          'GET',
          [{ body: {}, status: 500 }]
        );
        const clientPromise = client.fetchJson(`${apiHost}/`);
        await assert.isRejected(clientPromise, 'Bad Request: 500.');
      });

      it('resolves with a promise containing response json', async () => {
        const resJson = {thing: ['other'], this: {that: 1}};
        mockNodeFetch(
          nodeFetchStub,
          `${apiHost}/`,
          'GET',
          [{ body: resJson, status: 200 }]
        );
        const responseJson = await client.fetchJson(`${apiHost}/`);
        expect(responseJson).to.eql(resJson);
      });
    });

    describe('fetch', () => {
      const client = new Client(clientDefaults);
      let nodeFetchStub;

      beforeEach(() => {
        nodeFetchStub = sinon.stub(client, 'nodeFetch');
      });

      afterEach(() => {
        nodeFetchStub.restore();
      });

      it('sets json content type for string type body', async () => {
        nodeFetchStub.resolves(new JSONResponse({}, 200));

        await client.fetch(`${apiHost}/`, 'POST', 'body');

        assert.equal(
          nodeFetchStub.firstCall.args[1].headers['Content-Type'],
          'application/json'
        );
        sinon.assert.calledOnce(nodeFetchStub);
      });

      it("doesn't set content type for FormData type body", async () => {
        nodeFetchStub.resolves(new JSONResponse({}, 200));

        await client.fetch(`${apiHost}/`, 'POST', new FormData());

        assert.equal(
          nodeFetchStub.firstCall.args[1].headers['Content-Type'],
          undefined
        );
        sinon.assert.calledOnce(nodeFetchStub);
      });

      it("doesn't set content type for no body", async () => {
        nodeFetchStub.resolves(new JSONResponse({}, 200));

        await client.fetch(`${apiHost}/`, 'POST');

        assert.equal(
          nodeFetchStub.firstCall.args[1].headers['Content-Type'],
          undefined
        );
        sinon.assert.calledOnce(nodeFetchStub);
      });
    });
  });
});

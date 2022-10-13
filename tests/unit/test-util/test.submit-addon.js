/* @flow */
import { promises as fsPromises, readFileSync } from 'fs';
import path from 'path';

import { fs } from 'mz';
import { assert, expect } from 'chai';
import { afterEach, before, beforeEach, describe, it } from 'mocha';
import * as sinon from 'sinon';
import { File, FormData, Response } from 'node-fetch';

import Client, {
  JwtApiAuth,
  signAddon,
} from '../../../src/util/submit-addon.js';
import { withTempDir } from '../../../src/util/temp-dir.js';

class JSONResponse extends Response {
  constructor(data, status) {
    super(JSON.stringify(data), {status});
  }
}

const mockNodeFetch = (
  nodeFetchStub: any,
  url: URL | string,
  method: string,
  responses: Array<{
    body: any,
    status: number,
  }>
): void => {
  const stubMatcher = nodeFetchStub.withArgs(
    (url instanceof URL) ? url : new URL(url),
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
      amoBaseUrl: 'https://some.url/api/v5',
      timeout: 1,
      downloadDir: '/some-dir/',
      xpiPath: '/some.xpi',
      channel: 'some-channel',
    };

    it('creates Client with parameters', async () => {
      const apiKey = 'fooKey';
      const apiSecret = '4321';
      const amoBaseUrl = 'https://foo.host/api/v5';
      const baseUrl = new URL(amoBaseUrl);
      const downloadDir = '/foo';
      const clientSpy = sinon.spy(Client);
      const apiAuthSpy = sinon.spy(JwtApiAuth);

      await signAddon({
        ...signAddonDefaults,
        apiKey,
        apiSecret,
        amoBaseUrl,
        downloadDir,
        SubmitClient: clientSpy,
        ApiAuthClass: apiAuthSpy,
      });

      sinon.assert.calledOnce(apiAuthSpy);
      assert.deepEqual(
        apiAuthSpy.firstCall.args[0], {
          apiKey,
          apiSecret,
        }
      );
      sinon.assert.calledOnce(clientSpy);
      assert.deepEqual(
        clientSpy.firstCall.args[0], {
          apiAuth: {},
          baseUrl,
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

    it('throws error if amoBaseUrl is an invalid URL', async () => {
      const amoBaseUrl = 'badUrl';
      const signAddonPromise = signAddon({...signAddonDefaults, amoBaseUrl});
      await assert.isRejected(
        signAddonPromise,
        `Invalid AMO API base URL: ${amoBaseUrl}`
      );
    });

    it('passes through metadata json object if defined', async () => {
      const metaDataJson = {version: {license: 'MPL2.0'}};
      await signAddon({
        ...signAddonDefaults,
        metaDataJson,
      });
      sinon.assert.notCalled(putVersionStub);
      sinon.assert.calledWith(
        postNewAddonStub,
        signAddonDefaults.xpiPath,
        signAddonDefaults.channel,
        metaDataJson
      );
    });
  });

  describe('Client', () => {
    const baseUrl = new URL('http://not-a-real-amo-api.com/api/v5');

    const apiAuth = new JwtApiAuth(
      {apiKey: 'fake-api-key', apiSecret: '1234abcd'}
    );
    const clientDefaults = {
      apiAuth,
      baseUrl,
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

    const getAuthHeaderSpy = sinon.spy(apiAuth, 'getAuthHeader');

    afterEach(() => {
      getAuthHeaderSpy.resetHistory();
    });

    describe('doUploadSubmit', () => {
      it('submits the xpi', async () => {
        const client = new Client(clientDefaults);
        sinon.stub(client, 'fileFromSync')
          .returns(new File([], 'foo.xpi'));

        const nodeFetchStub = sinon.stub(client, 'nodeFetch');
        mockNodeFetch(
          nodeFetchStub,
          new URL('/addons/upload/', baseUrl),
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

        // Verify the jwt Authorization header are included in the response.
        sinon.assert.calledOnce(getAuthHeaderSpy);
        const authHeaderValue = await getAuthHeaderSpy.getCall(0).returnValue;
        assert.match(authHeaderValue, /^JWT .*/);
        sinon.assert.calledOnceWithMatch(
          nodeFetchStub,
          sinon.match.instanceOf(URL),
          sinon.match({
            headers: {
              Authorization: authHeaderValue,
            },
          })
        );
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
          new URL(`/addons/upload/${uploadUuid}/`, baseUrl),
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
          new URL(`/addons/upload/${uploadUuid}/`, baseUrl),
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
        const validationUrl = new URL('/to/validation/report', baseUrl);
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          new URL(`/addons/upload/${uploadUuid}/`, baseUrl),
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
          new URL('/addons/addon/', baseUrl),
          'POST',
          [
            { body: sampleAddonDetail, status: 202 },
          ]
        );
        const uploadUuid = 'some-uuid';
        const returnData = await client.doNewAddonSubmit(uploadUuid, {});
        expect(returnData).to.eql(sampleAddonDetail);
      });

      it('combines provided metaDataJson with upload uuid', async () => {
        const client = new Client(clientDefaults);
        const nodeFetchStub = sinon.stub(client, 'nodeFetch');
        nodeFetchStub.callsFake(async () => {
          return new JSONResponse(sampleAddonDetail, 202);
        });
        const uploadUuid = 'some-uuid';
        const metaDataJson = {
          version: {license: 'MPL2.0'}, categories: {firefox: ['other']},
        };
        const body = JSON.stringify({
          version: {upload: uploadUuid, license: metaDataJson.version.license},
          categories: metaDataJson.categories,
        });

        await client.doNewAddonSubmit(uploadUuid, metaDataJson);
        sinon.assert.calledWith(
          nodeFetchStub,
          sinon.match.instanceOf(URL),
          sinon.match({ method: 'POST', body })
        );
      });
    });

    describe('doNewAddonOrVersionSubmit', () => {
      it('puts the upload uuid to the addon detail', async () => {
        const client = new Client(clientDefaults);
        const guid = '@some-addon-guid';
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          new URL(`/addons/addon/${guid}/`, baseUrl),
          'POST',
          [
            { body: sampleAddonDetail, status: 202 },
          ]
        );
        const uploadUuid = 'some-uuid';
        await client.doNewAddonOrVersionSubmit(guid, uploadUuid, {});
      });

      it('combines provided metaDataJson with upload uuid', async () => {
        const client = new Client(clientDefaults);
        const nodeFetchStub = sinon.stub(client, 'nodeFetch');
        nodeFetchStub.callsFake(async () => {
          return new JSONResponse(sampleAddonDetail, 202);
        });
        const uploadUuid = 'some-uuid';
        const guid = '@some-addon-guid';
        const metaDataJson = {
          version: {license: 'MPL2.0'}, categories: {firefox: ['other']},
        };
        const body = JSON.stringify({
          version: {upload: uploadUuid, license: metaDataJson.version.license},
          categories: metaDataJson.categories,
        });

        await client.doNewAddonOrVersionSubmit(guid, uploadUuid, metaDataJson);
        sinon.assert.calledWith(
          nodeFetchStub,
          sinon.match.instanceOf(URL),
          sinon.match({ method: 'PUT', body })
        );
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
        const detailUrl =
          new URL(`/addons/addon/${addonId}/versions/${versionId}/`, baseUrl);
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          detailUrl,
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
        const detailUrl =
          new URL(`/addons/addon/${addonId}/versions/${versionId}/`, baseUrl);
        const url = new URL('/file/download/url', baseUrl);
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          detailUrl,
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
      const fileUrl = new URL(filePath, baseUrl);
      const addonId = '@some-addon-id';

      it('downloads the file to tmpdir', () => withTempDir(async (tmpDir) => {
        const client = new Client(
          { ...clientDefaults, downloadDir: tmpDir.path() },
        );
        const fileData = 'a';

        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          fileUrl,
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
          fileUrl,
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
          fileUrl,
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
          new URL('/addons/upload/', baseUrl),
          'POST',
          [{ body: sampleUploadDetail, status: 200 }]
        );
        mockNodeFetch(
          nodeFetchStub,
          new URL(`/addons/upload/${uploadUuid}/`, baseUrl),
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
        const url = (new URL(downloadPath, baseUrl).toString());
        mockNodeFetch(
          nodeFetchStub,
          new URL(`/addons/addon/${addonId}/versions/${versionId}/`, baseUrl),
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
            new URL('/addons/addon/', baseUrl),
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
          new URL(`/addons/addon/${addonId}/`, baseUrl),
          'PUT',
          [{ body: sampleAddonDetail, status: 200 }]
        );
        mockNodeFetch(
          nodeFetchStub,
          new URL(`/addons/addon/${addonId}/versions/${query}`, baseUrl),
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
          baseUrl,
          'GET',
          [{ body: {}, status: 400 }]
        );
        const clientPromise = client.fetchJson(baseUrl);
        await assert.isRejected(clientPromise, 'Bad Request: 400.');
      });

      it('rejects with a promise on < 100 responses', async () => {
        mockNodeFetch(
          nodeFetchStub,
          baseUrl,
          'GET',
          [{ body: {}, status: 99 }]
        );
        const clientPromise = client.fetchJson(baseUrl);
        await assert.isRejected(clientPromise, 'Bad Request: 99.');
      });

      it('rejects with a promise on >= 500 responses', async () => {
        mockNodeFetch(
          nodeFetchStub,
          baseUrl,
          'GET',
          [{ body: {}, status: 500 }]
        );
        const clientPromise = client.fetchJson(baseUrl);
        await assert.isRejected(clientPromise, 'Bad Request: 500.');
      });

      it('resolves with a promise containing response json', async () => {
        const resJson = {thing: ['other'], this: {that: 1}};
        mockNodeFetch(
          nodeFetchStub,
          baseUrl,
          'GET',
          [{ body: resJson, status: 200 }]
        );
        const responseJson = await client.fetchJson(baseUrl);
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

        await client.fetch(baseUrl, 'POST', 'body');

        assert.equal(
          nodeFetchStub.firstCall.args[1].headers['Content-Type'],
          'application/json'
        );
        sinon.assert.calledOnce(nodeFetchStub);
      });

      it("doesn't set content type for FormData type body", async () => {
        nodeFetchStub.resolves(new JSONResponse({}, 200));

        await client.fetch(baseUrl, 'POST', new FormData());

        assert.equal(
          nodeFetchStub.firstCall.args[1].headers['Content-Type'],
          undefined
        );
        sinon.assert.calledOnce(nodeFetchStub);
      });

      it("doesn't set content type for no body", async () => {
        nodeFetchStub.resolves(new JSONResponse({}, 200));

        await client.fetch(baseUrl, 'POST');

        assert.equal(
          nodeFetchStub.firstCall.args[1].headers['Content-Type'],
          undefined
        );
        sinon.assert.calledOnce(nodeFetchStub);
      });
    });
  });
});

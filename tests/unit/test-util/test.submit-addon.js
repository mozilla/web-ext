import { createHash } from 'crypto';
import { promises as fsPromises, readFileSync } from 'fs';
import path from 'path';

// eslint-disable-next-line import/no-extraneous-dependencies
import CRC32 from 'crc-32';
import { assert, expect } from 'chai';
import JSZip from 'jszip';
import { afterEach, before, beforeEach, describe, it } from 'mocha';
import * as sinon from 'sinon';
// eslint-disable-next-line no-shadow
import { File, FormData, Response } from 'node-fetch';

import { AMO_BASE_URL } from '../../../src/program.js';
import Client, {
  getUploadUuidFromFile,
  JwtApiAuth,
  saveIdToFile,
  saveUploadUuidToFile,
  signAddon,
} from '../../../src/util/submit-addon.js';
import { withTempDir } from '../../../src/util/temp-dir.js';

class JSONResponse extends Response {
  constructor(data, status) {
    super(JSON.stringify(data), { status });
  }
}

const mockNodeFetch = (nodeFetchStub, url, method, responses) => {
  const stubMatcher = nodeFetchStub.withArgs(
    url instanceof URL ? url : new URL(url),
    sinon.match.has('method', method)
  );
  for (let i = 0; i < responses.length; i++) {
    const { body, status } = responses[i];
    stubMatcher.onCall(i).callsFake(async () => {
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
    let getPreviousUuidOrUploadXpiStub;
    let postNewAddonStub;
    let putVersionStub;
    const uploadUuid = '{some-upload-uuid}';

    beforeEach(() => {
      statStub = sinon
        .stub(fsPromises, 'stat')
        .resolves({ isFile: () => true });
      getPreviousUuidOrUploadXpiStub = sinon
        .stub(Client.prototype, 'getPreviousUuidOrUploadXpi')
        .resolves(uploadUuid);
      postNewAddonStub = sinon.stub(Client.prototype, 'postNewAddon');
      putVersionStub = sinon.stub(Client.prototype, 'putVersion');
    });

    afterEach(() => {
      statStub.restore();
      getPreviousUuidOrUploadXpiStub.restore();
      postNewAddonStub.restore();
      putVersionStub.restore();
    });

    const signAddonDefaults = {
      apiKey: 'some-key',
      apiSecret: 'ffff',
      amoBaseUrl: AMO_BASE_URL,
      timeout: 1,
      downloadDir: '/some-dir/',
      xpiPath: '/some.xpi',
      channel: 'some-channel',
      savedIdPath: '.id-file',
      savedUploadUuidPath: '.uuid-file',
      userAgentString: 'web-ext/12.34',
    };

    it('creates Client with parameters', async () => {
      const apiKey = 'fooKey';
      const apiSecret = '4321';
      const amoBaseUrl = AMO_BASE_URL;
      const baseUrl = new URL(amoBaseUrl);
      const downloadDir = '/foo';
      const clientSpy = sinon.spy(Client);
      const apiAuthSpy = sinon.spy(JwtApiAuth);
      const userAgentString = 'web-ext/666.a.b';

      await signAddon({
        ...signAddonDefaults,
        apiKey,
        apiSecret,
        amoBaseUrl,
        downloadDir,
        userAgentString,
        SubmitClient: clientSpy,
        ApiAuthClass: apiAuthSpy,
      });

      sinon.assert.calledOnce(apiAuthSpy);
      assert.deepEqual(apiAuthSpy.firstCall.args[0], {
        apiKey,
        apiSecret,
      });
      sinon.assert.calledOnce(clientSpy);
      assert.deepEqual(clientSpy.firstCall.args[0], {
        apiAuth: {},
        baseUrl,
        validationCheckTimeout: signAddonDefaults.timeout,
        approvalCheckTimeout: signAddonDefaults.timeout,
        downloadDir,
        userAgentString,
      });
    });

    it('calls postNewAddon if `id` is undefined', async () => {
      const xpiPath = 'this/path/xpi.xpi';
      const channel = 'thisChannel';
      const savedIdPath = '.some.id.file';
      const savedUploadUuidPath = '.some.uuid.file';
      await signAddon({
        ...signAddonDefaults,
        xpiPath,
        channel,
        savedIdPath,
        savedUploadUuidPath,
      });
      sinon.assert.notCalled(putVersionStub);
      sinon.assert.calledWith(postNewAddonStub, uploadUuid, savedIdPath, {});
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
      sinon.assert.calledWith(putVersionStub, uploadUuid, id, {});
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
      const signAddonPromise = signAddon({ ...signAddonDefaults, amoBaseUrl });
      await assert.isRejected(
        signAddonPromise,
        `Invalid AMO API base URL: ${amoBaseUrl}`
      );
    });

    it('passes through metadata json object if defined', async () => {
      const metaDataJson = { version: { license: 'MPL2.0' } };
      await signAddon({
        ...signAddonDefaults,
        metaDataJson,
      });
      sinon.assert.notCalled(putVersionStub);
      sinon.assert.calledWith(
        postNewAddonStub,
        uploadUuid,
        signAddonDefaults.savedIdPath,
        metaDataJson
      );
    });
  });

  describe('Client', () => {
    const baseUrl = new URL(AMO_BASE_URL);

    const apiAuth = new JwtApiAuth({
      apiKey: 'fake-api-key',
      apiSecret: '1234abcd',
    });
    const clientDefaults = {
      apiAuth,
      baseUrl,
      approvalCheckInterval: 0,
      validationCheckInterval: 0,
      userAgentString: 'web-ext/12.34',
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

    const sampleAddonDetail = {
      // Note: most of the fields are ommited here, these are just the essentials.
      id: 9876,
      guid: '@this-guid',
      slug: 'this_addon',
      status: 'unreviewed',
      version: sampleVersionDetail,
    };

    const getAuthHeaderSpy = sinon.spy(apiAuth, 'getAuthHeader');

    afterEach(() => {
      getAuthHeaderSpy.resetHistory();
    });

    it('adds a missing trailing slash to baseUrl before setting apiUrl', () => {
      const noSlashBaseUrl = new URL('http://url.without/trailing/slash');
      const client = new Client({ ...clientDefaults, baseUrl: noSlashBaseUrl });
      assert.equal(
        client.apiUrl.href,
        new URL(`${noSlashBaseUrl.href}/addons/`).href
      );
    });

    it('drops extra characters on baseUrl before setting apiUrl', () => {
      const cleanUrl = 'http://url.with/extra';
      const extraBaseUrl = new URL(`${cleanUrl}?#`);
      const client = new Client({ ...clientDefaults, baseUrl: extraBaseUrl });
      assert.equal(client.apiUrl.href, new URL(`${cleanUrl}/addons/`).href);
    });

    describe('getPreviousUuidOrUploadXpi', () => {
      it('calls doUploadSubmit if previous hash is different to current', async () => {
        const oldHash = 'some-hash';
        const newHash = 'some-other-hash';
        const oldUuid = '{some-uuid}';
        const newUuid = '{some-other-uuid}';
        const channel = 'someChannel';
        const xpiPath = 'some/path/to/file.xpi';
        const uuidFilePath = 'some/path/to/.uploadUuid';
        const client = new Client(clientDefaults);
        sinon.stub(client, 'hashXpiCrcs').resolves(newHash);
        const doUploadStub = sinon
          .stub(client, 'doUploadSubmit')
          .resolves(newUuid);
        const saveUploadUuidStub = sinon.stub().resolves();
        const getUploadUuidStub = sinon
          .stub()
          .resolves({ uploadUuid: oldUuid, channel, xpiCrcHash: oldHash });

        const returnedUuid = await client.getPreviousUuidOrUploadXpi(
          xpiPath,
          channel,
          uuidFilePath,
          saveUploadUuidStub,
          getUploadUuidStub
        );

        assert.equal(returnedUuid, newUuid);
        sinon.assert.calledWith(getUploadUuidStub, uuidFilePath);
        sinon.assert.calledWith(doUploadStub, xpiPath, channel);
        sinon.assert.calledWith(saveUploadUuidStub, uuidFilePath, {
          uploadUuid: newUuid,
          channel,
          xpiCrcHash: newHash,
        });
      });

      it('skips doUploadSubmit if previous hash is the same as current', async () => {
        const xpiCrcHash = 'some-hash';
        const uploadUuid = '{some-uuid}';
        const xpiPath = 'some/path/to/file.xpi';
        const uuidFilePath = 'some/path/to/.uploadUuid';
        const channel = 'someChannel';
        const client = new Client(clientDefaults);
        sinon.stub(client, 'hashXpiCrcs').resolves(xpiCrcHash);
        const doUploadStub = sinon.stub(client, 'doUploadSubmit');
        const saveUploadUuidStub = sinon.stub();
        const getUploadUuidStub = sinon
          .stub()
          .resolves({ uploadUuid, channel, xpiCrcHash });

        const returnedUuid = await client.getPreviousUuidOrUploadXpi(
          xpiPath,
          channel,
          uuidFilePath,
          saveUploadUuidStub,
          getUploadUuidStub
        );

        assert.equal(returnedUuid, uploadUuid);
        sinon.assert.calledWith(getUploadUuidStub, uuidFilePath);
        sinon.assert.notCalled(doUploadStub);
        sinon.assert.notCalled(saveUploadUuidStub);
      });

      it('calls doUploadSubmit if the channel is different to current', async () => {
        const xpiCrcHash = 'some-hash';
        const oldUuid = '{some-uuid}';
        const newUuid = '{some-other-uuid}';
        const xpiPath = 'some/path/to/file.xpi';
        const uuidFilePath = 'some/path/to/.uploadUuid';
        const oldChannel = 'someChannel';
        const newChannel = 'someOtherChannel';
        const client = new Client(clientDefaults);
        sinon.stub(client, 'hashXpiCrcs').resolves(xpiCrcHash);
        const doUploadStub = sinon
          .stub(client, 'doUploadSubmit')
          .resolves(newUuid);
        const saveUploadUuidStub = sinon.stub();
        const getUploadUuidStub = sinon
          .stub()
          .resolves({ uploadUuid: oldUuid, channel: oldChannel, xpiCrcHash });

        const returnedUuid = await client.getPreviousUuidOrUploadXpi(
          xpiPath,
          newChannel,
          uuidFilePath,
          saveUploadUuidStub,
          getUploadUuidStub
        );

        assert.equal(returnedUuid, newUuid);
        sinon.assert.calledWith(getUploadUuidStub, uuidFilePath);
        sinon.assert.calledWith(doUploadStub, xpiPath, newChannel);
        sinon.assert.calledWith(saveUploadUuidStub, uuidFilePath, {
          uploadUuid: newUuid,
          channel: newChannel,
          xpiCrcHash,
        });
      });
    });

    describe('hashXpiCrcs', () => {
      const buildZip = async (zipFilePath, files) => {
        const zip = new JSZip();
        files.forEach((args) => {
          zip.file(...args);
        });
        await fsPromises.writeFile(
          zipFilePath,
          await zip.generateAsync({ type: 'nodebuffer' })
        );
        return zip;
      };

      it('returns a sha256 hash of the crc32 hashes of the zip entries', async () => {
        await withTempDir(async (tmpDir) => {
          const client = new Client(clientDefaults);
          const jsFileContents = 'something();';
          const manifestContents = JSON.stringify({ manifest_version: 2 });
          const jsFileName = 'foo.js';
          const manifestFileName = 'manifest.json';

          const files = [
            [jsFileName, jsFileContents],
            [manifestFileName, manifestContents],
          ];
          const zipFilePath = path.join(tmpDir.path(), 'someextension.zip');
          await buildZip(zipFilePath, files);

          const originalHash = createHash('sha256');
          originalHash.update(
            JSON.stringify([
              {
                path: jsFileName,
                crc32: CRC32.str(jsFileContents),
              },
              {
                path: manifestFileName,
                crc32: CRC32.str(manifestContents),
              },
            ])
          );

          assert.equal(
            await client.hashXpiCrcs(zipFilePath),
            originalHash.digest('hex')
          );
        });
      });

      it('returns a different hash when a directory is added to the zip', async () => {
        await withTempDir(async (tmpDir) => {
          const client = new Client(clientDefaults);
          const files = [
            ['manifest.json', JSON.stringify({ manifest_version: 2 })],
            ['foo.js', 'something();'],
          ];
          const someZipFilePath = path.join(tmpDir.path(), 'someextension.zip');
          await buildZip(someZipFilePath, files);

          const otherZipFilePath = path.join(
            tmpDir.path(),
            'otherextension.zip'
          );
          await buildZip(otherZipFilePath, [
            ...files,
            ['dir/', null, { dir: true }],
          ]);

          assert.notEqual(
            await client.hashXpiCrcs(someZipFilePath),
            await client.hashXpiCrcs(otherZipFilePath)
          );
        });
      });

      it('returns a different hash when a directory is replaced with an empty file', async () => {
        await withTempDir(async (tmpDir) => {
          const client = new Client(clientDefaults);
          const files = [
            ['manifest.json', JSON.stringify({ manifest_version: 2 })],
            ['foo.js', 'something();'],
          ];
          const emptyName = 'dir';
          const someZipFilePath = path.join(tmpDir.path(), 'someextension.zip');
          await buildZip(someZipFilePath, [...files, [emptyName, '']]);

          const otherZipFilePath = path.join(
            tmpDir.path(),
            'otherextension.zip'
          );
          await buildZip(otherZipFilePath, [
            ...files,
            [emptyName, null, { dir: true }],
          ]);

          assert.notEqual(
            await client.hashXpiCrcs(someZipFilePath),
            await client.hashXpiCrcs(otherZipFilePath)
          );
        });
      });

      it('returns a different hash when a file is renamed', async () => {
        await withTempDir(async (tmpDir) => {
          const client = new Client(clientDefaults);
          const jsFileContents = 'something();';
          const manifestContents = JSON.stringify({ manifest_version: 2 });
          const manifestFileName = 'manifest.json';
          const someZipFilePath = path.join(tmpDir.path(), 'someextension.zip');
          await buildZip(someZipFilePath, [
            [manifestFileName, manifestContents],
            ['a.js', jsFileContents],
          ]);

          const otherZipFilePath = path.join(
            tmpDir.path(),
            'otherextension.zip'
          );
          await buildZip(otherZipFilePath, [
            [manifestFileName, manifestContents],
            ['A.js', jsFileContents],
          ]);

          assert.notEqual(
            await client.hashXpiCrcs(someZipFilePath),
            await client.hashXpiCrcs(otherZipFilePath)
          );
        });
      });

      it('returns the same hash when file order changes', async () => {
        await withTempDir(async (tmpDir) => {
          const client = new Client(clientDefaults);
          const jsFileName = 'foo.js';
          const jsFileContents = 'something();';
          const manifestContents = JSON.stringify({ manifest_version: 2 });
          const manifestFileName = 'manifest.json';
          const someZipFilePath = path.join(tmpDir.path(), 'someextension.zip');
          await buildZip(someZipFilePath, [
            [manifestFileName, manifestContents],
            [jsFileName, jsFileContents],
          ]);

          const otherZipFilePath = path.join(
            tmpDir.path(),
            'otherextension.zip'
          );
          await buildZip(otherZipFilePath, [
            [jsFileName, jsFileContents],
            [manifestFileName, manifestContents],
          ]);

          assert.equal(
            await client.hashXpiCrcs(someZipFilePath),
            await client.hashXpiCrcs(otherZipFilePath)
          );
        });
      });
    });

    describe('doUploadSubmit', () => {
      it('submits the xpi', async () => {
        const client = new Client(clientDefaults);
        sinon.stub(client, 'fileFromSync').returns(new File([], 'foo.xpi'));

        const nodeFetchStub = sinon.stub(client, 'nodeFetch');
        mockNodeFetch(
          nodeFetchStub,
          new URL('addons/upload/', baseUrl),
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
        const waitStub = sinon
          .stub(client, 'waitForValidation')
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
          new URL(`addons/upload/${uploadUuid}/`, baseUrl),
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
          new URL(`addons/upload/${uploadUuid}/`, baseUrl),
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
        const validationUrl = new URL('to/validation/report', baseUrl);
        mockNodeFetch(
          sinon.stub(client, 'nodeFetch'),
          new URL(`addons/upload/${uploadUuid}/`, baseUrl),
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
          new URL('addons/addon/', baseUrl),
          'POST',
          [{ body: sampleAddonDetail, status: 202 }]
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
          version: { license: 'MPL2.0' },
          categories: { firefox: ['other'] },
        };
        const body = JSON.stringify({
          version: {
            upload: uploadUuid,
            license: metaDataJson.version.license,
          },
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
        const nodeFetchStub = sinon.stub(client, 'nodeFetch');
        mockNodeFetch(
          nodeFetchStub,
          new URL(`addons/addon/${guid}/`, baseUrl),
          'PUT',
          [{ body: sampleAddonDetail, status: 202 }]
        );
        const uploadUuid = 'some-other-uuid';

        await client.doNewAddonOrVersionSubmit(guid, uploadUuid, {});
        sinon.assert.calledWith(
          nodeFetchStub,
          sinon.match.instanceOf(URL),
          sinon.match({
            method: 'PUT',
            body: JSON.stringify({ version: { upload: uploadUuid } }),
          })
        );
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
          version: { license: 'MPL2.0' },
          categories: { firefox: ['other'] },
        };
        const body = JSON.stringify({
          version: {
            upload: uploadUuid,
            license: metaDataJson.version.license,
          },
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
        const detailUrl = new URL(
          `addons/addon/${addonId}/versions/${versionId}/`,
          baseUrl
        );
        mockNodeFetch(sinon.stub(client, 'nodeFetch'), detailUrl, 'GET', [
          { body: {}, status: 200 },
        ]);
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
        const detailUrl = new URL(
          `addons/addon/${addonId}/versions/${versionId}/`,
          baseUrl
        );
        const url = new URL('file/download/url', baseUrl);
        mockNodeFetch(sinon.stub(client, 'nodeFetch'), detailUrl, 'GET', [
          { body: {}, status: 200 },
          { body: {}, status: 200 },
          { body: { file: { status: 'public', url } }, status: 200 },
        ]);
        const fileUrl = await client.waitForApproval(addonId, versionId);
        assert.equal(fileUrl, url);
      });
    });

    describe('downloadSignedFile', () => {
      const filename = 'download.xpi';
      const filePath = `/path/to/${filename}`;
      const fileUrl = new URL(filePath, baseUrl);
      const addonId = '@some-addon-id';

      it('downloads the file to tmpdir', () =>
        withTempDir(async (tmpDir) => {
          const client = new Client({
            ...clientDefaults,
            downloadDir: tmpDir.path(),
          });
          const fileData = 'a';

          mockNodeFetch(sinon.stub(client, 'nodeFetch'), fileUrl, 'GET', [
            { body: fileData, status: 200 },
          ]);

          const result = await client.downloadSignedFile(fileUrl, addonId);
          expect(result).to.eql({
            id: addonId,
            downloadedFiles: [filename],
          });
          const fullPath = path.join(tmpDir.path(), filename);
          const stat = await fsPromises.stat(fullPath);
          assert.equal(stat.isFile(), true);
          assert.equal(readFileSync(fullPath), fileData);
        }));

      it('raises when the response is not ok', async () => {
        const client = new Client(clientDefaults);

        mockNodeFetch(sinon.stub(client, 'nodeFetch'), fileUrl, 'GET', [
          { body: 'a', status: 404 },
        ]);

        const clientPromise = client.downloadSignedFile(fileUrl, addonId);
        await assert.isRejected(
          clientPromise,
          `Downloading ${filename} failed`
        );
      });

      it('raises a consistent error when fetch raises', async () => {
        const client = new Client(clientDefaults);
        sinon.stub(client, 'fetch').rejects(new Error('some fetch error'));

        const clientPromise = client.downloadSignedFile(fileUrl, addonId);
        await assert.isRejected(
          clientPromise,
          `Downloading ${filename} failed`
        );
      });

      it('raises a consistent error when saveToFile raises', async () => {
        const client = new Client(clientDefaults);

        mockNodeFetch(sinon.stub(client, 'nodeFetch'), fileUrl, 'GET', [
          { body: 'a', status: 200 },
        ]);

        sinon.stub(client, 'saveToFile').rejects(new Error('some save error'));

        const clientPromise = client.downloadSignedFile(fileUrl, addonId);
        await assert.isRejected(
          clientPromise,
          `Downloading ${filename} failed`
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

      const addApprovalMocks = (versionId) => {
        const url = new URL(downloadPath, baseUrl).toString();
        mockNodeFetch(
          nodeFetchStub,
          new URL(`addons/addon/${addonId}/versions/${versionId}/`, baseUrl),
          'GET',
          [
            {
              body: { file: { status: 'public', url } },
              status: 200,
            },
          ]
        );
        mockNodeFetch(nodeFetchStub, url, 'GET', [
          { body: `${versionId}`, status: 200 },
        ]);
      };

      it('creates new add-on; downloads the signed xpi', async () => {
        const versionId = sampleVersionDetail.id;
        const saveIdStub = sinon.stub();
        saveIdStub.resolves();
        const idFile = 'id.file';
        mockNodeFetch(
          nodeFetchStub,
          new URL('addons/addon/', baseUrl),
          'POST',
          [{ body: sampleAddonDetail, status: 200 }]
        );
        addApprovalMocks(versionId);
        await client.postNewAddon(uploadUuid, idFile, {}, saveIdStub);
        sinon.assert.calledWith(saveIdStub, idFile, sampleAddonDetail.guid);
      });

      it('creates a new version; then downloads the signed xpi', async () => {
        const versionId = sampleVersionDetail.id;

        mockNodeFetch(
          nodeFetchStub,
          new URL(`addons/addon/${addonId}/`, baseUrl),
          'PUT',
          [{ body: sampleAddonDetail, status: 200 }]
        );

        addApprovalMocks(versionId);
        await client.putVersion(uploadUuid, `${addonId}`, {});
      });
    });

    describe('fetchJson', () => {
      const client = new Client(clientDefaults);
      const nodeFetchStub = sinon.stub(client, 'nodeFetch');

      afterEach(() => {
        nodeFetchStub.reset();
      });

      it('rejects with a promise on not ok responses', async () => {
        mockNodeFetch(nodeFetchStub, baseUrl, 'GET', [
          { body: {}, status: 400 },
        ]);
        const clientPromise = client.fetchJson(baseUrl);
        await assert.isRejected(clientPromise, 'Bad Request: 400.');
      });

      it('rejects with a promise on < 100 responses', async () => {
        mockNodeFetch(nodeFetchStub, baseUrl, 'GET', [
          { body: {}, status: 99 },
        ]);
        const clientPromise = client.fetchJson(baseUrl);
        await assert.isRejected(clientPromise, 'Bad Request: 99.');
      });

      it('rejects with a promise on >= 500 responses', async () => {
        mockNodeFetch(nodeFetchStub, baseUrl, 'GET', [
          { body: {}, status: 500 },
        ]);
        const clientPromise = client.fetchJson(baseUrl);
        await assert.isRejected(clientPromise, 'Bad Request: 500.');
      });

      it('resolves with a promise containing response json', async () => {
        const resJson = { thing: ['other'], this: { that: 1 } };
        mockNodeFetch(nodeFetchStub, baseUrl, 'GET', [
          { body: resJson, status: 200 },
        ]);
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

      it('sends special user agent string', async () => {
        nodeFetchStub.resolves(new JSONResponse({}, 200));

        await client.fetch(baseUrl, 'POST');

        assert.equal(
          nodeFetchStub.firstCall.args[1].headers['User-Agent'],
          client.userAgentString
        );
        sinon.assert.calledOnce(nodeFetchStub);
      });
    });
  });

  describe('saveIdToFile', () => {
    it('saves an extension ID to file', () =>
      withTempDir((tmpDir) => {
        const idFile = path.join(tmpDir.path(), 'extensionId.File');
        return saveIdToFile(idFile, 'some-id')
          .then(() => fsPromises.readFile(idFile))
          .then((content) => {
            assert.include(content.toString(), 'some-id');
          });
      }));

    it('will overwrite an existing file', () =>
      withTempDir((tmpDir) => {
        const idFile = path.join(tmpDir.path(), 'extensionId.File');
        return saveIdToFile(idFile, 'first-id')
          .then(() => saveIdToFile(idFile, 'second-id'))
          .then(() => fsPromises.readFile(idFile))
          .then((content) => {
            assert.include(content.toString(), 'second-id');
          });
      }));
  });

  describe('saveUploadUuidToFile', () => {
    it('saves a uuid & hash to file', () => {
      const data = {
        uploadUuid: '{some-uuid}',
        channel: 'someChannel',
        xpiCrcHash: '123456',
      };
      withTempDir((tmpDir) => {
        const uuidFile = path.join(tmpDir.path(), 'uploadUuid.File');
        return saveUploadUuidToFile(uuidFile, data)
          .then(() => fsPromises.readFile(uuidFile))
          .then((content) => {
            assert.equal(content.toString(), JSON.stringify(data));
          });
      });
    });

    it('will overwrite an existing file', () =>
      withTempDir((tmpDir) => {
        const firstData = {
          uploadUuid: '{some-uuid}',
          channel: 'listed',
          xpiCrcHash: '123456',
        };
        const secondData = {
          uploadUuid: '{other-uuid}',
          channel: 'unlisted',
          xpiCrcHash: '987654',
        };
        const uuidFile = path.join(tmpDir.path(), 'uploadUuid.File');
        return saveUploadUuidToFile(uuidFile, firstData)
          .then(() => saveUploadUuidToFile(uuidFile, secondData))
          .then(() => fsPromises.readFile(uuidFile))
          .then((content) => {
            assert.equal(content.toString(), JSON.stringify(secondData));
          });
      }));
  });

  describe('getUploadUuidFromFile', () => {
    it('gets an upload uuid and hash from a saved file', () => {
      const savedData = {
        uploadUuid: '{some-uuid}',
        channel: 'someChannel',
        xpiCrcHash: '123456',
      };
      withTempDir((tmpDir) => {
        const uuidFile = path.join(tmpDir.path(), 'uploadUuid.File');
        return saveUploadUuidToFile(uuidFile, savedData)
          .then(() => getUploadUuidFromFile(uuidFile))
          .then((returnedData) => {
            assert.equal(returnedData, savedData);
          });
      });
    });

    it('returns empty strings for uuid and hash if file does not exist', () => {
      getUploadUuidFromFile('some/path/that/doesnt/exist/.file').then(
        (returnedData) =>
          assert.equal(returnedData, {
            uploadUuid: '',
            channel: '',
            xpiCrcHash: '',
          })
      );
    });

    it('returns empty strings for uuid and hash if file is malformed', () => {
      withTempDir(async (tmpDir) => {
        const uuidFile = path.join(tmpDir.path(), 'uploadUuid.File');
        await fsPromises.writeFile(uuidFile, 'not json');
        return getUploadUuidFromFile(uuidFile).then((returnedData) => {
          assert.equal(returnedData, {
            uploadUuid: '',
            channel: '',
            xpiCrcHash: '',
          });
        });
      });
    });
  });
});

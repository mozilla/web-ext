import { once } from 'node:events';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { assert } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';

import Client from '../../../src/util/submit-addon.js';
import { withTempDir } from '../../../src/util/temp-dir.js';

describe('util.submit-addon proxy transport', () => {
  let origin;
  let proxy;
  let baseUrl;
  let apiProxy;
  let requests;
  let tunnels;
  let sockets;
  let rejectProxy;

  beforeEach(async () => {
    requests = [];
    tunnels = [];
    sockets = new Set();
    rejectProxy = false;
    origin = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString(),
      });
      if (request.url === '/signed.xpi') {
        response.write(Buffer.from([0x50, 0x4b]));
        setTimeout(() => response.end(Buffer.from([0, 0xff])), 20);
      } else {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ received: true }));
      }
    });
    origin.listen(0, '127.0.0.1');
    await once(origin, 'listening');
    baseUrl = new URL(`http://127.0.0.1:${origin.address().port}/`);

    proxy = createServer();
    proxy.on('connect', (request, socket, head) => {
      tunnels.push({ url: request.url, headers: request.headers });
      sockets.add(socket);
      if (rejectProxy) {
        socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        return;
      }
      const upstream = connect(origin.address().port, '127.0.0.1');
      sockets.add(upstream);
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      upstream.on('connect', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        socket.pipe(upstream).pipe(socket);
      });
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    apiProxy = `http://127.0.0.1:${proxy.address().port}`;
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.destroy();
    }
    origin.closeAllConnections();
    proxy.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => origin.close(resolve)),
      new Promise((resolve) => proxy.close(resolve)),
    ]);
  });

  const makeClient = (options = {}) =>
    new Client({
      baseUrl,
      apiProxy,
      apiAuth: { getAuthHeader: async () => 'JWT test-token' },
      userAgentString: 'web-ext-proxy-test',
      ...options,
    });

  const checkProxy = () => {
    assert.lengthOf(tunnels, 1);
    assert.equal(tunnels[0].url, baseUrl.host);
    assert.lengthOf(requests, 1);
    assert.equal(requests[0].headers.authorization, 'JWT test-token');
    assert.equal(requests[0].headers['user-agent'], 'web-ext-proxy-test');
  };

  it('routes JSON polling requests through the configured proxy', async () => {
    assert.deepEqual(await makeClient().fetchJson(baseUrl), { received: true });
    checkProxy();
    assert.equal(requests[0].method, 'GET');
  });

  it('preserves JSON version submissions through the proxy', async () => {
    const body = JSON.stringify({ version: { upload: 'test-upload' } });
    await makeClient().fetchJson(baseUrl, 'PUT', body);
    checkProxy();
    assert.equal(requests[0].method, 'PUT');
    assert.equal(requests[0].body, body);
    assert.equal(requests[0].headers['content-type'], 'application/json');
  });

  for (const method of ['POST', 'PATCH']) {
    it(`preserves multipart ${method} uploads through the proxy`, async () => {
      const body = new FormData();
      body.set('channel', 'unlisted');
      body.set('upload', new Blob(['extension-bytes']), 'extension.xpi');
      await makeClient().fetchJson(baseUrl, method, body);
      checkProxy();
      assert.equal(requests[0].method, method);
      assert.match(
        requests[0].headers['content-type'],
        /^multipart\/form-data; boundary=/,
      );
      assert.include(requests[0].body, 'filename="extension.xpi"');
      assert.include(requests[0].body, 'extension-bytes');
      assert.include(requests[0].body, 'unlisted');
    });
  }

  it('streams signed file downloads through the proxy', () =>
    withTempDir(async (tmpDir) => {
      const result = await makeClient({
        downloadDir: tmpDir.path(),
      }).downloadSignedFile(new URL('signed.xpi', baseUrl), 'test-addon');
      checkProxy();
      assert.deepEqual(result.downloadedFiles, ['signed.xpi']);
      assert.deepEqual(
        readFileSync(path.join(tmpDir.path(), 'signed.xpi')),
        Buffer.from([0x50, 0x4b, 0, 0xff]),
      );
    }));

  it('supports URL-encoded proxy credentials', async () => {
    const proxyUrl = new URL(apiProxy);
    proxyUrl.username = 'user';
    proxyUrl.password = 'p%40ss';
    await makeClient({ apiProxy: proxyUrl.href }).fetchJson(baseUrl);
    checkProxy();
    assert.equal(
      tunnels[0].headers['proxy-authorization'],
      `Basic ${Buffer.from('user:p@ss').toString('base64')}`,
    );
    assert.notProperty(requests[0].headers, 'proxy-authorization');
  });

  it('does not bypass a proxy that rejects the connection', async () => {
    rejectProxy = true;
    await assert.isRejected(makeClient().fetchJson(baseUrl), 'fetch failed');
    assert.lengthOf(tunnels, 1);
    assert.lengthOf(requests, 0);
  });

  it('keeps direct requests working when no proxy is configured', async () => {
    assert.deepEqual(
      await makeClient({ apiProxy: undefined }).fetchJson(baseUrl),
      { received: true },
    );
    assert.lengthOf(tunnels, 0);
    assert.lengthOf(requests, 1);
  });
});

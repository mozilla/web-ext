/* @flow */
import net from 'net';

import {describe, it, beforeEach, afterEach} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import FirefoxRDPClient, {
  connectToFirefox,
  parseRDPMessage,
} from '../../../src/firefox/rdp-client';

function createFakeRDPServer() {
  let lastSocket;

  function sendRDPMessage(msg: Object) {
    let data = Buffer.from(JSON.stringify(msg));
    data = Buffer.concat([
      Buffer.from(`${data.length}:`),
      data,
    ]);
    lastSocket.write(data);
  }

  const server = net.createServer((socket) => {
    lastSocket?.destroy();
    lastSocket = socket;
    // Send the initial RDP root message.
    sendRDPMessage({from: 'root'});
  });

  return {
    server,
    sendRDPMessage,
    get port() {
      return server.address()?.port;
    },
    get socket() {
      return lastSocket;
    },
    async listen() {
      return new Promise((resolve) => server.listen(resolve));
    },
    destroy() {
      lastSocket?.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
    get awaitConnected() {
      return new Promise((resolve) => {
        server.once('connection', resolve);
      });
    },
    get awaitData() {
      return new Promise((resolve) => {
        lastSocket.once('data', (data) => resolve(data));
      });
    },
  };
}

describe('rdp-client', () => {
  describe('parseRDPMessage', () => {
    it('returns a fatal error on failing to parse RDP message length', () => {
      const data = Buffer.from('NOT_A_NUMBER:fakerdpdata');
      const res = parseRDPMessage(data);
      assert.isUndefined(res.rdpMessage);
      assert.instanceOf(res.error, Error);
      assert.match(res.error?.message, /Error parsing RDP message length/);
      assert.isTrue(res.fatal);
      assert.strictEqual(res.data.length, data.length);
    });

    it('returns a non-fatal error on failing to parse RDP message data', () => {
      const data = Buffer.from('1:{');
      const res = parseRDPMessage(data);
      assert.isUndefined(res.rdpMessage);
      assert.instanceOf(res.error, Error);
      assert.isFalse(res.fatal);
      assert.strictEqual(res.data.length, 0);
    });

    it('does parse RDP message when all expected data is available', () => {
      const rdpObj = {from: 'fake-actor'};
      const rdpBuffer = Buffer.from(JSON.stringify(rdpObj));
      // Create a buffer with an incomplete rdp message.
      const incompleteData = Buffer.concat([
        Buffer.from(`${rdpBuffer.length}:`),
        rdpBuffer.slice(0, rdpBuffer.length - 5),
      ]);

      let res = parseRDPMessage(incompleteData);
      assert.isUndefined(res.rdpMessage);
      assert.isUndefined(res.error, Error);
      assert.strictEqual(res.data, incompleteData);

      const fullData = Buffer.concat([
        incompleteData,
        rdpBuffer.slice(rdpBuffer.length - 5),
      ]);

      res = parseRDPMessage(fullData);
      assert.isUndefined(res.error, Error);
      assert.strictEqual(res.data.length, 0);
      assert.deepEqual(res.rdpMessage, rdpObj);
    });
  });

  describe('FirefoxRDPClient', () => {
    let fakeRDPServer;
    let client: FirefoxRDPClient;

    beforeEach(() => {
      fakeRDPServer = createFakeRDPServer();
    });

    afterEach(async () => {
      client?.disconnect();
      await fakeRDPServer?.destroy();
    });

    async function getConnectedRDPClient() {
      await fakeRDPServer.listen();
      const promiseServerConn = fakeRDPServer.awaitConnected;
      const promiseClientConn = connectToFirefox(fakeRDPServer.port);
      const sock = await promiseServerConn;
      assert.instanceOf(sock, net.Socket);
      client = await promiseClientConn;
    }

    function assertClientHasNoRequests() {
      assert.equal(client._active.size, 0);
      assert.equal(client._pending.length, 0);
    }

    it('connects to a Firefox RDP server', async () => {
      await getConnectedRDPClient();
    });

    it('forwards some of the events emitted by the connection', async () => {
      await getConnectedRDPClient();
      const forwardedEvents = ['error', 'end', 'timeout'];
      const expectedData = {
        error: new Error('fake-error'),
        // no data is expected for end and timeout events.
        end: undefined,
        timeout: undefined,
      };
      for (const name of forwardedEvents) {
        const promiseEvent = new Promise((resolve) =>
          client.once(name, (evt) => resolve(evt)));
        client._rdpConnection.emit(name, expectedData[name]);
        assert.equal(await promiseEvent, expectedData[name],
                     `${name} event got forwarded as expected`);
      }
    });

    describe('request', () => {
      it('sends an RDP request', async () => {
        const expectedRequest = {to: 'root', type: 'getRoot'};
        const expectedResponse = {from: 'root', addonsActor: 'fake-actor-id'};
        await getConnectedRDPClient();

        // Assert expected data received by the RDP server when sending
        // an RDP request by requestType string.
        const promiseServerData = fakeRDPServer.awaitData;
        const promiseResponse = client.request('getRoot');
        const res = parseRDPMessage(await promiseServerData);
        assert.isUndefined(res.error);
        assert.deepEqual(res.rdpMessage, expectedRequest);

        // Assert request promise resolved with the RDP server
        // response.
        fakeRDPServer.sendRDPMessage(expectedResponse);
        assert.deepEqual(await promiseResponse, expectedResponse);

        // Send another RDP request by passing the entire RDP message.
        const promiseServerData2 = fakeRDPServer.awaitData;
        const promiseResponse2 = client.request({to: 'root', type: 'getRoot'});
        const res2 = parseRDPMessage(await promiseServerData2);
        assert.isUndefined(res2.error);
        assert.deepEqual(res2.rdpMessage, expectedRequest);
        fakeRDPServer.sendRDPMessage(expectedResponse);
        assert.deepEqual(await promiseResponse2, expectedResponse);
      });

      it('rejects on RDP request without a target actor', async () => {
        await getConnectedRDPClient();
        await assert.isRejected(
          // $FlowIgnore: ignore flowtype error for testing purpose.
          client.request({type: 'getRoot'}),
          /Unexpected RDP request without target actor/
        );
      });

      it('rejects on RDP request on source actor RDP error reply', async () => {
        await getConnectedRDPClient();
        const promiseRes = client.request('getRoot');
        const serverReply = {from: 'root', error: 'fake-error', message: 'msg'};
        fakeRDPServer.sendRDPMessage(serverReply);

        const rdpReply = await assert.isRejected(promiseRes);
        assert.notInstanceOf(rdpReply, Error);
        assert.deepEqual(rdpReply, serverReply);
      });

      it('does disconnect on fatal parsing error', async () => {
        await getConnectedRDPClient();
        let error;
        client.once('error', (err) => error = err);
        const promiseRes = client.request('getRoot');
        fakeRDPServer.socket.write(Buffer.from('NaN:fakerdpdata'));
        await assert.isRejected(promiseRes, /RDP connection closed/);
        assert.instanceOf(error, Error);
      });
    });

    describe('handleMessage', () => {
      it('emits rdp-error event on RDP error and no source actor', async () => {
        await getConnectedRDPClient();
        const promiseRDPError = new Promise((resolve) => {
          client.once('rdp-error', (err) => resolve(err));
        });
        const rdpError = {error: 'fake-err', message: 'fake-msg'};
        fakeRDPServer.sendRDPMessage(rdpError);
        assert.deepEqual(await promiseRDPError, rdpError);
      });

      it('emits an unsolicited-event on known request types', async () => {
        await getConnectedRDPClient();
        const promiseEvent = new Promise((resolve) => {
          client.once('unsolicited-event', (msg) => resolve(msg));
        });
        const unsolicitedEvent = {
          from: 'root',
          type: 'tabListChanged',
        };
        fakeRDPServer.sendRDPMessage(unsolicitedEvent);
        assert.deepEqual(await promiseEvent, unsolicitedEvent);
      });

      async function testHandleMessageError(rdpMsg, expectedErrorMessage) {
        await getConnectedRDPClient();
        const promiseError = new Promise((resolve) => {
          client.once('error', (err) => resolve(err));
        });
        fakeRDPServer.sendRDPMessage(rdpMsg);
        const error = await promiseError;
        assert.instanceOf(error, Error);
        assert.match(
          error?.message,
          expectedErrorMessage
        );
      }

      it('emits an error event on messages with no source actor', () =>
        testHandleMessageError(
          {message: 'fake-msg'},
          /Received an RDP message without a sender actor/
        ));

      it('emits error event on unexpected source actor', () =>
        testHandleMessageError(
          {message: 'fake-msg', from: 'unexpected-actor'},
          /Unexpected RDP message received/
        ));
    });

    describe('flushPendingRequests', () => {
      it('does queue multiple requests for the same target actor', async () => {
        await getConnectedRDPClient();
        const promiseResponse1 = client.request('request1');
        const promiseResponse2 = client.request('request2');

        // Expect one active and one pending request.
        assert.equal(client._active.size, 1);
        assert.equal(client._pending.length, 1);

        const response1 = {from: 'root', resultFor: 'request1'};
        const response2 = {from: 'root', resultFor: 'request2'};

        fakeRDPServer.sendRDPMessage(response1);
        assert.deepEqual(await promiseResponse1, response1);

        // Expect one active and no pending request.
        assert.equal(client._active.size, 1);
        assert.equal(client._pending.length, 0);

        fakeRDPServer.sendRDPMessage(response2);
        assert.deepEqual(await promiseResponse2, response2);
      });

      it('rejects requests if not connected', async () => {
        const c = new FirefoxRDPClient();
        await assert.isRejected(
          c.request('getRoot'),
          /RDP connection closed/
        );
      });

      it('rejects all requests on closed connection', async () => {
        await getConnectedRDPClient();
        const awaitResponse = client.request('active-request');
        const awaitResponse2 = client.request('pending-request');
        client.disconnect();
        await assert.isRejected(awaitResponse, /RDP connection closed/);
        await assert.isRejected(awaitResponse2, /RDP connection closed/);
        assertClientHasNoRequests();
      });

      it('rejects request if fails to stringify', async () => {
        // Create an object with a circular dependency to trigger a stringify.
        // exception.
        const req = {to: 'root'};
        // $FlowIgnore: ignore flowtype error for testing purpose.
        req.circular = req;

        await getConnectedRDPClient();
        await assert.isRejected(
          // $FlowIgnore: ignore flowtype error for testing purpose.
          client.request(req),
          Error,
        );
        assertClientHasNoRequests();
      });

      describe('_expectReply', () => {
        // Not an expected scenario, just added for coverage.
        it('throws if target actor has an active request', async () => {
          await getConnectedRDPClient();
          client.request('getRoot');
          const expectedActive = client._active.get('root');

          const fakeDeferred = {resolve: () => {}, reject: () => {}};
          assert.throws(
            () => client._expectReply('root', fakeDeferred),
            /root does already have an active request/
          );

          assert.strictEqual(client._active.get('root'), expectedActive);
        });
      });
    });
  });

  describe('FirefoxRDPClient disconnect', () => {
    it('does remove connection event listeners', async () => {
      const c = new FirefoxRDPClient();
      const fakeConn = {
        end: sinon.spy(),
        off: sinon.spy(),
      };

      // $FlowIgnore: allow overwrite property for testing purpose.
      c._rdpConnection = fakeConn;
      // $FlowIgnore
      c._onData = function fakeOnData() {};
      // $FlowIgnore
      c._onError = function fakeOnError() {};
      // $FlowIgnore
      c._onEnd = function fakeOnEnd() {};
      // $FlowIgnore
      c._onTimeout = function fakeOnTimeout() {};

      c.disconnect();
      sinon.assert.calledOnce(fakeConn.end);
      sinon.assert.callCount(fakeConn.off, 4);
      sinon.assert.calledWith(fakeConn.off, 'data', c._onData);
      sinon.assert.calledWith(fakeConn.off, 'error', c._onError);
      sinon.assert.calledWith(fakeConn.off, 'end', c._onEnd);
      sinon.assert.calledWith(fakeConn.off, 'timeout', c._onTimeout);
    });
  });

});

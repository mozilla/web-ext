/* @flow */
import net from 'net';

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  onlyInstancesOf,
  RemoteTempInstallNotSupported,
  UsageError,
  WebExtError,
} from '../../../src/errors';
import {
  connect as defaultConnector,
  connectWithMaxRetries,
  RemoteFirefox,
  findFreeTcpPort,
} from '../../../src/firefox/remote';
import {
  fakeFirefoxClient,
  makeSureItFails,
  TCPConnectError,
} from '../helpers';


describe('firefox.remote', () => {

  describe('connect', () => {

    function prepareConnection(port = 6005, options = {}) {
      options = {
        connectToFirefox:
          sinon.spy(() => Promise.resolve(fakeFirefoxClient())),
        ...options,
      };
      // $FlowIgnore: allow use of inexact object literal for testing purpose.
      const connect = defaultConnector(port, options);
      return {options, connect};
    }

    it('resolves with a RemoteFirefox instance', async () => {
      const client = await prepareConnection().connect;
      assert.instanceOf(client, RemoteFirefox);
    });

    it('connects on the default port', async () => {
      const {connect, options} = prepareConnection();
      await connect;
      sinon.assert.calledWith(options.connectToFirefox, 6005);
    });

    it('lets you configure the port', async () => {
      const {connect, options} = prepareConnection(7000);
      await connect;
      // $FlowIgnore: flow doesn't know about sinon spy properties.
      assert.equal(options.connectToFirefox.args[0], 7000);
    });

  });

  describe('RemoteFirefox', () => {

    function fakeAddon() {
      return {id: 'some-id', actor: 'serv1.localhost'};
    }

    function makeInstance(client = fakeFirefoxClient()) {
      return new RemoteFirefox(client);
    }

    it('listens to client events', () => {
      const client = fakeFirefoxClient();
      const listener = sinon.spy(() => {});
      client.on = listener;
      makeInstance(client); // this will register listeners

      // Make sure no errors are thrown when the client emits
      // events and calls each handler.
      const eventListenerTests = ([
        ['disconnect', undefined],
        ['end', undefined],
        ['unsolicited-event', {}],
        ['rdp-error', {}],
        ['error', new Error('fake')],
      ]);
      for (let i = 0; i < eventListenerTests.length; i++) {
        const [name, data] = eventListenerTests[i];
        listener.getCall(i).calledWith(name);
        listener.getCall(i).args[1](data);
      }
    });

    describe('disconnect', () => {
      it('lets you disconnect', () => {
        const client = fakeFirefoxClient();
        const conn = makeInstance(client);
        conn.disconnect();

        sinon.assert.called(client.disconnect);
      });
    });

    describe('addonRequest', () => {

      it('makes requests to an add-on actor', async () => {
        const addon = fakeAddon();
        const stubResponse = {requestTypes: ['reload']};
        const client = fakeFirefoxClient();
        client.request = sinon.stub().resolves(stubResponse);

        const conn = makeInstance(client);
        const response = await conn.addonRequest(addon, 'requestTypes');

        sinon.assert.called(client.request);
        sinon.assert.calledWithMatch(
          client.request,
          {type: 'requestTypes', to: 'serv1.localhost'});

        assert.deepEqual(response, stubResponse);
      });

      it('throws when add-on actor requests fail', async () => {
        const addon = fakeAddon();
        const client = fakeFirefoxClient();
        client.request = sinon.stub().rejects({
          error: 'unknownError',
          message: 'some actor failure',
        });

        const conn = makeInstance(client);
        await conn.addonRequest(addon, 'requestTypes')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(
              error.message,
              /unknownError: some actor failure/);
          }));
      });
    });

    describe('getInstalledAddon', () => {

      it('gets an installed add-on by ID', async () => {
        const someAddonId = 'some-id';
        const client = fakeFirefoxClient();
        client.request = sinon.stub().resolves({
          addons: [{id: 'another-id'}, {id: someAddonId}, {id: 'bazinga'}],
        });
        const conn = makeInstance(client);
        const addon = await conn.getInstalledAddon(someAddonId);
        assert.equal(addon.id, someAddonId);
      });

      it('throws an error when the add-on is not installed', async () => {
        const client = fakeFirefoxClient();
        client.request = sinon.stub().resolves({
          addons: [{id: 'one-id'}, {id: 'other-id'}],
        });
        const conn = makeInstance(client);
        await conn.getInstalledAddon('missing-id')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message,
                         /does not have your extension installed/);
          }));
      });

      it('throws an error when listAddons() fails', async () => {
        const client = fakeFirefoxClient();
        client.request = sinon.stub().rejects(new Error('some internal error'));
        const conn = makeInstance(client);
        await conn.getInstalledAddon('some-id')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.equal(
              error.message,
              'Remote Firefox: listAddons() error: Error: some internal error');
          }));
      });

    });

    describe('checkForAddonReloading', () => {

      it('checks for reload requestType in remote debugger', async () => {
        const addon = fakeAddon();
        const stubResponse = {requestTypes: ['reload']};
        const conn = makeInstance();

        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.addonRequest = sinon.stub().resolves(stubResponse);

        const returnedAddon = await conn.checkForAddonReloading(addon);
        sinon.assert.called(conn.addonRequest);
        const args = conn.addonRequest.firstCall.args;

        assert.equal(args[0].id, addon.id);
        assert.equal(args[1], 'requestTypes');

        assert.deepEqual(returnedAddon, addon);
      });

      it('throws an error if reload is not supported', async () => {
        const addon = fakeAddon();
        const stubResponse = {requestTypes: ['install']};
        const conn = makeInstance();

        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.addonRequest = () => Promise.resolve(stubResponse);

        await conn.checkForAddonReloading(addon)
          .then(makeSureItFails())
          .catch(onlyInstancesOf(UsageError, (error) => {
            assert.match(error.message, /does not support add-on reloading/);
          }));
      });

      it('only checks for reloading once', async () => {
        const addon = fakeAddon();
        const conn = makeInstance();

        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.addonRequest =
          sinon.stub().resolves({requestTypes: ['reload']});
        const checkedAddon = await conn.checkForAddonReloading(addon);
        const finalAddon = await conn.checkForAddonReloading(checkedAddon);
        // This should remember not to check a second time.
        sinon.assert.calledOnce(conn.addonRequest);
        assert.deepEqual(finalAddon, addon);
      });
    });

    describe('installTemporaryAddon', () => {

      it('throws getRoot errors', async () => {
        const client = fakeFirefoxClient();
        client.request = sinon.stub().rejects(
          // listTabs and getRoot response:
          new Error('some listTabs error'),
        );
        const conn = makeInstance(client);
        await conn.installTemporaryAddon('/path/to/addon')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message, /some listTabs error/);
          }));

        // When getRoot fails, a fallback to listTabs is expected.
        sinon.assert.calledTwice(client.request);
        sinon.assert.calledWith(client.request, 'getRoot');
        sinon.assert.calledWith(client.request, 'listTabs');
      });

      it('fails when there is no add-ons actor', async () => {
        const client = fakeFirefoxClient();
        // A getRoot and listTabs response that does not contain addonsActor.
        client.request = sinon.stub().resolves({from: 'root'});
        const conn = makeInstance(client);
        await conn.installTemporaryAddon('/path/to/addon')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(RemoteTempInstallNotSupported, (error) => {
            assert.match(
              error.message,
              /This version of Firefox does not provide an add-ons actor/);
          }));
        sinon.assert.calledOnce(client.request);
        sinon.assert.calledWith(client.request, 'getRoot');
      });

      it('lets you install an add-on temporarily', async () => {
        const client = fakeFirefoxClient();
        client.request = sinon.spy(async (request) => {
          if (request === 'getRoot') {
            return {addonsActor: 'addons1.actor.conn'};
          }

          if (request.type === 'installTemporaryAddon') {
            return {
              addon: {id: 'abc123@temporary-addon'},
            };
          }
        });
        const conn = makeInstance(client);
        const response = await conn.installTemporaryAddon('/path/to/addon');
        assert.equal(response.addon.id, 'abc123@temporary-addon');

        // When called without error, there should not be any fallback.
        sinon.assert.calledTwice(client.request);
        sinon.assert.calledWith(client.request, 'getRoot');
      });

      it('falls back to listTabs when getRoot is unavailable', async () => {
        const client = fakeFirefoxClient();
        client.request = sinon.stub();
        const addonsActor = 'addons1.actor.conn';
        const addonPath = '/path/to/addon';

        client.request.withArgs({
          type: 'installTemporaryAddon',
          to: addonsActor,
          addonPath,
        }).resolves({
          addon: {id: 'abc123@temporary-addon'},
        });

        // Sample response from Firefox 49.
        client.request.withArgs('getRoot').rejects({
          error: 'unrecognizedPacketType',
          message: 'Actor root does not recognize the packet type getRoot',
        });
        client.request.withArgs('listTabs').resolves({
          addonsActor,
        });
        const conn = makeInstance(client);
        const response = await conn.installTemporaryAddon(addonPath);
        assert.equal(response.addon.id, 'abc123@temporary-addon');

        sinon.assert.callCount(client.request, 3);
        sinon.assert.calledWith(client.request, 'getRoot');
        sinon.assert.calledWith(client.request, 'listTabs');
      });

      it('fails when getRoot and listTabs both fail', async () => {
        const client = fakeFirefoxClient();
        client.request = sinon.stub();
        // Sample response from Firefox 48.
        client.request.withArgs('getRoot').rejects({
          error: 'unrecognizedPacketType',
          message: 'Actor root does not recognize the packet type getRoot',
        });
        client.request.withArgs('listTabs').resolves({});
        const conn = makeInstance(client);
        await conn.installTemporaryAddon('/path/to/addon')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(RemoteTempInstallNotSupported, (error) => {
            assert.match(
              error.message,
              /does not provide an add-ons actor.*Try Firefox 49/);
          }));

        sinon.assert.calledTwice(client.request);
        sinon.assert.calledWith(client.request, 'getRoot');
        sinon.assert.calledWith(client.request, 'listTabs');
      });

      it('throws install errors', async () => {
        const client = fakeFirefoxClient();
        client.request = sinon.spy(async (request) => {
          if (request === 'getRoot') {
            return {
              addonsActor: 'addons1.actor.conn',
            };
          }
          if (request.type === 'installTemporaryAddon') {
            return Promise.reject({
              error: 'install error',
              message: 'error message',
            });
          }
        });
        const conn = makeInstance(client);
        await conn.installTemporaryAddon('/path/to/addon')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message, /install error: error message/);
          }));
      });

    });

    describe('reloadAddon', () => {

      it('asks the actor to reload the add-on', async () => {
        const addon = fakeAddon();
        const conn = makeInstance();

        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.getInstalledAddon = sinon.stub().resolves(addon);
        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.checkForAddonReloading =
          (addonToCheck) => Promise.resolve(addonToCheck);
        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.addonRequest = sinon.stub().resolves({});

        await conn.reloadAddon('some-id');
        sinon.assert.called(conn.getInstalledAddon);
        sinon.assert.calledWith(conn.getInstalledAddon, 'some-id');
        sinon.assert.called(conn.addonRequest);

        const requestArgs = conn.addonRequest.firstCall.args;
        assert.deepEqual(requestArgs[0], addon);
        assert.equal(requestArgs[1], 'reload');
      });

      it('makes sure the addon can be reloaded', async () => {
        const addon = fakeAddon();
        const conn = makeInstance();

        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.getInstalledAddon = () => Promise.resolve(addon);
        // $FlowIgnore: allow overwrite not writable property for testing purpose.
        conn.checkForAddonReloading =
          sinon.spy((addonToCheck) => Promise.resolve(addonToCheck));

        await conn.reloadAddon(addon.id);

        sinon.assert.called(conn.checkForAddonReloading);
        assert.deepEqual(conn.checkForAddonReloading.firstCall.args[0],
                         addon);
      });

    });

  });

  describe('connectWithMaxRetries', () => {

    function firefoxClient(opt = {}, deps) {
      // $FlowIgnore: allow use of inexact object literal for testing purpose.
      return connectWithMaxRetries({
        maxRetries: 0, retryInterval: 1, port: 6005, ...opt,
      }, deps);
    }

    it('retries after a connection error', async () => {
      const client = new RemoteFirefox(fakeFirefoxClient());
      var tryCount = 0;
      const connectToFirefox = sinon.spy(() => new Promise(
        (resolve, reject) => {
          tryCount ++;
          if (tryCount === 1) {
            reject(new TCPConnectError('first connection fails'));
          } else {
            // The second connection succeeds.
            resolve(client);
          }
        }));

      await firefoxClient({maxRetries: 3}, {connectToFirefox});
      sinon.assert.calledTwice(connectToFirefox);
    });

    it('only retries connection errors', async () => {
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new Error('not a connection error')));

      await firefoxClient({maxRetries: 2}, {connectToFirefox})
        .then(makeSureItFails())
        .catch((error) => {
          sinon.assert.calledOnce(connectToFirefox);
          assert.equal(error.message, 'not a connection error');
        });
    });

    it('gives up connecting after too many retries', async () => {
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new TCPConnectError('failure')));

      await firefoxClient({maxRetries: 2}, {connectToFirefox})
        .then(makeSureItFails())
        .catch((error) => {
          sinon.assert.calledThrice(connectToFirefox);
          assert.equal(error.message, 'failure');
        });
    });

  });

  describe('findFreeTcpPort', () => {
    async function promiseServerOnPort(port): Promise<net.Server> {
      return new Promise((resolve) => {
        const srv = net.createServer();
        // $FlowFixMe: signature for listen() is missing - see https://github.com/facebook/flow/pull/8290
        srv.listen(port, '127.0.0.1', () => {
          resolve(srv);
        });
      });
    }

    it('resolves to a free tcp port', async () => {
      const port = await findFreeTcpPort();
      assert.isNumber(port);
      // Expect a port that is not in the reserved range.
      assert.isAtLeast(port, 1024);

      // The TCP port can be used to successfully start a TCP server.
      const srv = await promiseServerOnPort(port);
      assert.equal(srv.address().port, port);

      // Check that calling tcp port again doesn't return the
      // previous port (as it is not free anymore).
      const newPort = await findFreeTcpPort();
      assert.notStrictEqual(port, newPort);
      assert.isAtLeast(port, 1024);

      // The new TCP port can be used to successfully start a TCP server.
      const srv2 = await promiseServerOnPort(newPort);
      assert.equal(srv2.address().port, newPort);

      srv.close();
      srv2.close();
    });

  });

});

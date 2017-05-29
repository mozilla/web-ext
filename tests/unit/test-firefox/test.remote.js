/* @flow */
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
} from '../../../src/firefox/remote';
import {
  fakeFirefoxClient,
  makeSureItFails,
  TCPConnectError,
} from '../helpers';


describe('firefox.remote', () => {

  describe('connect', () => {

    function prepareConnection(port = undefined, options = {}) {
      options = {
        connectToFirefox:
          sinon.spy(() => Promise.resolve(fakeFirefoxClient())),
        ...options,
      };
      const connect = defaultConnector(port, options);
      return {options, connect};
    }

    it('resolves with a RemoteFirefox instance', () => {
      return prepareConnection().connect.then((client) => {
        assert.instanceOf(client, RemoteFirefox);
      });
    });

    it('connects on the default port', () => {
      const {connect, options} = prepareConnection();
      return connect.then(() => {
        assert.equal(options.connectToFirefox.firstCall.args[0], 6005);
      });
    });

    it('lets you configure the port', () => {
      const {connect, options} = prepareConnection(7000);
      return connect.then(() => {
        assert.equal(options.connectToFirefox.args[0], 7000);
      });
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
      client.client.on = listener;
      makeInstance(client); // this will register listeners
      // Make sure no errors are thrown when the client emits
      // events and calls each handler.
      listener.firstCall.args[1](); // disconnect
      listener.secondCall.args[1](); // end
      listener.thirdCall.args[1]({}); // message
    });

    describe('disconnect', () => {
      it('lets you disconnect', () => {
        const client = fakeFirefoxClient();
        const conn = makeInstance(client);
        conn.disconnect();
        assert.equal(client.disconnect.called, true);
      });
    });

    describe('addonRequest', () => {

      it('makes requests to an add-on actor', () => {
        const addon = fakeAddon();
        const stubResponse = {requestTypes: ['reload']};
        const client = fakeFirefoxClient({
          makeRequestResult: stubResponse,
        });

        const conn = makeInstance(client);
        return conn.addonRequest(addon, 'requestTypes')
          .then((response) => {

            assert.equal(client.client.makeRequest.called, true);
            const args = client.client.makeRequest.firstCall.args;
            assert.equal(args[0].type, 'requestTypes');
            assert.equal(args[0].to, 'serv1.localhost');

            assert.deepEqual(response, stubResponse);
          });
      });

      it('throws when add-on actor requests fail', () => {
        const addon = fakeAddon();
        const client = fakeFirefoxClient({
          makeRequestError: {
            error: 'unknownError',
            message: 'some actor failure',
          },
        });

        const conn = makeInstance(client);
        return conn.addonRequest(addon, 'requestTypes')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.equal(
              error.message,
              'unknownError: some actor failure');
          }));
      });
    });

    describe('getInstalledAddon', () => {

      it('gets an installed add-on by ID', () => {
        const someAddonId = 'some-id';
        const client = fakeFirefoxClient({
          requestResult: {
            addons: [{id: 'another-id'}, {id: someAddonId}, {id: 'bazinga'}],
          },
        });
        const conn = makeInstance(client);
        return conn.getInstalledAddon(someAddonId)
          .then((addon) => {
            assert.equal(addon.id, someAddonId);
          });
      });

      it('throws an error when the add-on is not installed', () => {
        const client = fakeFirefoxClient({
          requestResult: {
            addons: [{id: 'one-id'}, {id: 'other-id'}],
          },
        });
        const conn = makeInstance(client);
        return conn.getInstalledAddon('missing-id')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message,
                         /does not have your extension installed/);
          }));
      });

      it('throws an error when listAddons() fails', () => {
        const client = fakeFirefoxClient({
          requestError: new Error('some internal error'),
        });
        const conn = makeInstance(client);
        return conn.getInstalledAddon('some-id')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.equal(
              error.message,
              'Remote Firefox: listAddons() error: Error: some internal error');
          }));
      });
    });

    describe('checkForAddonReloading', () => {

      it('checks for reload requestType in remote debugger', () => {
        const addon = fakeAddon();
        const stubResponse = {requestTypes: ['reload']};
        const conn = makeInstance();

        conn.addonRequest = sinon.spy(() => Promise.resolve(stubResponse));

        return conn.checkForAddonReloading(addon)
          .then((returnedAddon) => {
            assert.equal(conn.addonRequest.called, true);
            const args = conn.addonRequest.firstCall.args;

            assert.equal(args[0].id, addon.id);
            assert.equal(args[1], 'requestTypes');

            assert.deepEqual(returnedAddon, addon);
          });
      });

      it('throws an error if reload is not supported', () => {
        const addon = fakeAddon();
        const stubResponse = {requestTypes: ['install']};
        const conn = makeInstance();

        conn.addonRequest = () => Promise.resolve(stubResponse);

        return conn.checkForAddonReloading(addon)
          .then(makeSureItFails())
          .catch(onlyInstancesOf(UsageError, (error) => {
            assert.match(error.message, /does not support add-on reloading/);
          }));
      });

      it('only checks for reloading once', () => {
        const addon = fakeAddon();
        const conn = makeInstance();

        conn.addonRequest =
          sinon.spy(() => Promise.resolve({requestTypes: ['reload']}));
        return conn.checkForAddonReloading(addon)
          .then((checkedAddon) => conn.checkForAddonReloading(checkedAddon))
          .then((finalAddon) => {
            // This should remember not to check a second time.
            assert.equal(conn.addonRequest.callCount, 1);
            assert.deepEqual(finalAddon, addon);
          });
      });
    });

    describe('installTemporaryAddon', () => {

      it('throws listTabs errors', () => {
        const client = fakeFirefoxClient({
          // listTabs response:
          requestError: new Error('some listTabs error'),
        });
        const conn = makeInstance(client);
        return conn.installTemporaryAddon('/path/to/addon')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message, /some listTabs error/);
          }));
      });

      it('fails when there is no add-ons actor', () => {
        const client = fakeFirefoxClient({
          // A listTabs response that does not contain addonsActor.
          requestResult: {},
        });
        const conn = makeInstance(client);
        return conn.installTemporaryAddon('/path/to/addon')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(RemoteTempInstallNotSupported, (error) => {
            assert.match(error.message, /does not provide an add-ons actor/);
          }));
      });

      it('lets you install an add-on temporarily', () => {
        const client = fakeFirefoxClient({
          // listTabs response:
          requestResult: {
            addonsActor: 'addons1.actor.conn',
          },
          // installTemporaryAddon response:
          makeRequestResult: {
            addon: {id: 'abc123@temporary-addon'},
          },
        });
        const conn = makeInstance(client);
        return conn.installTemporaryAddon('/path/to/addon')
          .then((response) => {
            assert.equal(response.addon.id, 'abc123@temporary-addon');
          });
      });

      it('throws install errors', () => {
        const client = fakeFirefoxClient({
          // listTabs response:
          requestResult: {
            addonsActor: 'addons1.actor.conn',
          },
          // installTemporaryAddon response:
          makeRequestError: {
            error: 'install error',
            message: 'error message',
          },
        });
        const conn = makeInstance(client);
        return conn.installTemporaryAddon('/path/to/addon')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message, /install error: error message/);
          }));
      });

    });

    describe('reloadAddon', () => {

      it('asks the actor to reload the add-on', () => {
        const addon = fakeAddon();
        const conn = makeInstance();

        conn.getInstalledAddon = sinon.spy(() => Promise.resolve(addon));
        conn.checkForAddonReloading =
          (addonToCheck) => Promise.resolve(addonToCheck);
        conn.addonRequest = sinon.spy(() => Promise.resolve({}));

        return conn.reloadAddon('some-id')
          .then(() => {
            assert.equal(conn.getInstalledAddon.called, true);
            assert.equal(conn.getInstalledAddon.firstCall.args[0], 'some-id');

            assert.equal(conn.addonRequest.called, true);
            const requestArgs = conn.addonRequest.firstCall.args;
            assert.deepEqual(requestArgs[0], addon);
            assert.equal(requestArgs[1], 'reload');
          });
      });

      it('makes sure the addon can be reloaded', () => {
        const addon = fakeAddon();
        const conn = makeInstance();

        conn.getInstalledAddon = () => Promise.resolve(addon);
        conn.checkForAddonReloading =
          sinon.spy((addonToCheck) => Promise.resolve(addonToCheck));

        return conn.reloadAddon(addon.id)
          .then(() => {
            assert.equal(conn.checkForAddonReloading.called, true);
            assert.deepEqual(conn.checkForAddonReloading.firstCall.args[0],
                             addon);
          });
      });

    });

  });

  describe('connectWithMaxRetries', () => {

    function firefoxClient(
      opt = {}, deps,
    ) {
      return connectWithMaxRetries({
        maxRetries: 0, retryInterval: 1, port: 6005, ...opt,
      }, deps);
    }

    it('retries after a connection error', () => {
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

      return firefoxClient({maxRetries: 3}, {connectToFirefox})
        .then(() => {
          assert.equal(connectToFirefox.callCount, 2);
        });
    });

    it('only retries connection errors', () => {
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new Error('not a connection error')));

      return firefoxClient({maxRetries: 2}, {connectToFirefox})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(connectToFirefox.callCount, 1);
          assert.equal(error.message, 'not a connection error');
        });
    });

    it('gives up connecting after too many retries', () => {
      const connectToFirefox = sinon.spy(
        () => Promise.reject(new TCPConnectError('failure')));

      return firefoxClient({maxRetries: 2}, {connectToFirefox})
        .then(makeSureItFails())
        .catch((error) => {
          assert.equal(connectToFirefox.callCount, 3);
          assert.equal(error.message, 'failure');
        });
    });

  });

});

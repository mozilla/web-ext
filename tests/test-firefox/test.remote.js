/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {WebExtError, onlyInstancesOf} from '../../src/errors';
import {makeSureItFails} from '../helpers';
import {default as defaultConnector, RemoteFirefox}
  from '../../src/firefox/remote';


describe('firefox.remote', () => {

  describe('connect', () => {

    function prepareConnection(port=undefined, options={}) {
      options = {
        connectToFirefox: sinon.spy(() => Promise.resolve({})),
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
        assert.equal(options.connectToFirefox.firstCall.args[0], 6000);
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

    function fakeClient(
        {requestResult={}, requestError=null,
         makeRequestResult={}, makeRequestError=null}: Object = {}) {
      return {
        disconnect: sinon.spy(() => {}),
        request: sinon.spy(
          (request, callback) => callback(requestError, requestResult)),
        // This is client.client, the actual underlying connection.
        client: {
          makeRequest: sinon.spy((request, callback) => {
            //
            // The real function returns a response object that you
            // use like this:
            // if (response.error) {
            //   ...
            // } else {
            //   response.something; // ...
            // }
            //
            if (makeRequestError) {
              callback({error: makeRequestError});
            } else {
              callback(makeRequestResult);
            }
          }),
        },
      };
    }

    function fakeAddon() {
      return {id: 'some-id', actor: 'serv1.localhost'};
    }

    function makeInstance(client=fakeClient()) {
      return new RemoteFirefox(client);
    }

    describe('disconnect', () => {
      it('lets you disconnect', () => {
        const client = fakeClient();
        const conn = makeInstance(client);
        conn.disconnect();
        assert.equal(client.disconnect.called, true);
      });
    });

    describe('addonRequest', () => {

      it('makes requests to an add-on actor', () => {
        const addon = fakeAddon();
        const stubResponse = {requestTypes: ['reload']};
        const client = fakeClient({
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
        const client = fakeClient({
          makeRequestError: new Error('some actor request failure'),
        });

        const conn = makeInstance(client);
        return conn.addonRequest(addon, 'requestTypes')
          .then(makeSureItFails())
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.equal(
              error.message,
              'requestTypes response error: Error: some actor request failure');
          }));
      });
    });

    describe('getInstalledAddon', () => {

      it('gets an installed add-on by ID', () => {
        const someAddonId = 'some-id';
        const client = fakeClient({
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
        const client = fakeClient({
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
        const client = fakeClient({
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
          .catch(onlyInstancesOf(WebExtError, (error) => {
            assert.match(error.message, /does not support addon\.reload/);
          }));
      });

      it('only checks for reloading once', () => {
        const addon = fakeAddon();
        const conn = makeInstance();
        conn.addonRequest =
          sinon.spy(() => Promise.resolve({requestTypes: ['reload']}));
        return conn.checkForAddonReloading(addon)
          .then((addon) => conn.checkForAddonReloading(addon))
          .then((returnedAddon) => {
            // This should remember not to check a second time.
            assert.equal(conn.addonRequest.callCount, 1);
            assert.deepEqual(returnedAddon, addon);
          });
      });
    });

    describe('reloadAddon', () => {

      it('asks the actor to reload the add-on', () => {
        const addon = fakeAddon();
        const conn = makeInstance();
        conn.getInstalledAddon = sinon.spy(() => Promise.resolve(addon));
        conn.checkForAddonReloading = (addon) => Promise.resolve(addon);
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
          sinon.spy((addon) => Promise.resolve(addon));

        return conn.reloadAddon(addon.id)
          .then(() => {
            assert.equal(conn.checkForAddonReloading.called, true);
            assert.deepEqual(conn.checkForAddonReloading.firstCall.args[0],
                             addon);
          });
      });

    });

  });

});

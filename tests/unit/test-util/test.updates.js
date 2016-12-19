/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {checkForAutomaticUpdates} from '../../../src/util/updates';

describe('util/automatic self-updates', () => {
  it('calls the notifier with the correct parameters', () => {
    let updateNotifierStub = sinon.spy(() => {
      return {
        notify: sinon.spy(),
      };
    });

    checkForAutomaticUpdates({
      name: 'web-ext',
      version: '1.0.0',
      updateCheckInterval: 0,
      updateNotifier: updateNotifierStub,
    });
    assert.equal(updateNotifierStub.firstCall.args[0].pkg.name, 'web-ext');
    assert.equal(updateNotifierStub.firstCall.args[0].pkg.version, '1.0.0');
    assert.equal(updateNotifierStub.firstCall.args[0].updateCheckInterval, 0);
  });
});
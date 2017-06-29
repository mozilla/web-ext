/* @flow */
import {it, describe} from 'mocha';
import sinon from 'sinon';

import {checkForUpdates} from '../../../src/util/updates';

describe('util/updates', () => {
  describe('checkForUpdates()', () => {
    it('calls the notifier with the correct parameters', () => {
      const updateNotifierStub = sinon.spy(() => {
        return {
          notify: sinon.spy(),
        };
      });

      checkForUpdates({
        version: '1.0.0',
        updateNotifier: updateNotifierStub,
      });

      sinon.assert.calledWithMatch(
        updateNotifierStub, {
          updateCheckInterval: 1000 * 60 * 60 * 24 * 3,
          pkg: { name: 'web-ext', version: '1.0.0' },
        }
      );
    });
  });
});

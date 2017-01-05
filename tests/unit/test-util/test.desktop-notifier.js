/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {desktopNotifications} from '../../../src/util/desktop-notifier';
import {createLogger} from '../../../src/util/logger';

describe('util/desktop-notifier', () => {
  describe('desktopNotifications()', () => {
    const expectedNotification = {
      title: 'web-ext run: title',
      message: 'message',
    };

    it('is called and creates a message with correct parameters', () => {
      const fakeNotifier = {
        notify: sinon.spy(() => Promise.resolve()),
      };
      desktopNotifications(
        expectedNotification, {
          notifier: fakeNotifier,
        });
      assert.ok(fakeNotifier.notify.called);
      assert.equal(
        fakeNotifier.notify.firstCall.args[0].title,
        'web-ext run: title',
      );
      assert.equal(fakeNotifier.notify.firstCall.args[0].message, 'message');
    });

    it('logs error when notifier fails', () => {
      const expectedError = new Error('an error');
      const log = createLogger(__filename);
      sinon.spy(log, 'debug');
      const fakeNotifier = {
        notify: (obj, callback) => {
          callback(expectedError, 'response');
        },
      };

      desktopNotifications(
        expectedNotification, {
          notifier: fakeNotifier,
          logger: log,
        });
      assert.ok(log.debug.called);
      assert.equal(log.debug.firstCall.args[0],
                `notifier error: ${expectedError.message}, response: response`);
    });

  });
});

/* @flow */
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {desktopNotifications} from '../../../src/util/desktop-notifier';

describe('util/desktop-notifier', () => {
  describe('desktopNotifications()', () => {
    it('is called and creates a message with correct parameters', () => {
      const fakeNotifier = {
        notify: sinon.spy(() => Promise.resolve()),
      };

      desktopNotifications(
        {
          titleString: 'web-ext run: title',
          messageString: 'message',
          notifierSource: fakeNotifier,
        });
      assert.equal(fakeNotifier.notify.called, true);
      assert.equal(
        fakeNotifier.notify.firstCall.args[0].title,
        'web-ext run: title',
      );
      assert.equal(fakeNotifier.notify.firstCall.args[0].message, 'message');
    });
  });
});

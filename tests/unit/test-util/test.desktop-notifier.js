import { it, describe } from 'mocha';
import * as sinon from 'sinon';

import { showDesktopNotification } from '../../../src/util/desktop-notifier.js';
import { createLogger } from '../../../src/util/logger.js';
import { makeSureItFails } from '../helpers.js';

describe('util/desktop-notifier', () => {
  describe('desktopNotifications()', () => {
    const expectedNotification = {
      title: 'web-ext run: title',
      message: 'message',
    };

    it('is called and creates a message with correct parameters', () => {
      const fakeNotifier = {
        notify: sinon.spy((options, callback) => callback()),
      };
      return showDesktopNotification(expectedNotification, {
        notifier: fakeNotifier,
      }).then(() => {
        sinon.assert.calledWithMatch(fakeNotifier.notify, {
          title: 'web-ext run: title',
          message: 'message',
        });
      });
    });

    it('logs error when notifier fails', () => {
      const expectedError = new Error('an error');
      const fakeLog = createLogger(import.meta.url);
      sinon.spy(fakeLog, 'debug');
      const fakeNotifier = {
        notify: (obj, callback) => {
          callback(expectedError, 'response');
        },
      };

      return showDesktopNotification(expectedNotification, {
        notifier: fakeNotifier,
        log: fakeLog,
      })
        .then(makeSureItFails())
        .catch(() => {
          sinon.assert.calledWith(
            fakeLog.debug,
            `Desktop notifier error: ${expectedError.message}, ` +
              'response: response'
          );
        });
    });
  });
});

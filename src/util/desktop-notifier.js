import defaultNotifier from 'node-notifier';

import { createLogger } from './logger.js';

const defaultLog = createLogger(import.meta.url);

export function showDesktopNotification(
  { title, message, icon },
  { notifier = defaultNotifier, log = defaultLog } = {}
) {
  return new Promise((resolve, reject) => {
    notifier.notify({ title, message, icon }, (err, res) => {
      if (err) {
        log.debug(
          `Desktop notifier error: ${err.message},` + ` response: ${res}`
        );
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

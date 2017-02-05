/* @flow */
import defaultNotifier from 'node-notifier';

import {createLogger} from './logger';
import type {Logger} from './logger';

const defaultLog = createLogger(__filename);

type desktopNotificationsParams = {|
  title: string,
  message: string,
  icon?: string,
|};

export type desktopNotificationsOptions = {|
  notifier?: typeof defaultNotifier,
  log?: Logger,
|};

export function showDesktopNotification(
  {
    title, message, icon,
  }: desktopNotificationsParams,
  {
    notifier = defaultNotifier,
    log = defaultLog,
  }: desktopNotificationsOptions = {}
): Promise<void> {

  return new Promise((resolve, reject) => {
    notifier.notify({title, message, icon}, (err, res) => {
      if (err) {
        log.debug(`Desktop notifier error: ${err.message},` +
                 ` response: ${res}`);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

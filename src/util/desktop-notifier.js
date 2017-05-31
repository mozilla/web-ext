/* @flow */
import defaultNotifier from 'node-notifier';

import {createLogger} from './logger';
import type {Logger} from './logger';

const defaultLog = createLogger(__filename);

export type DesktopNotificationsParams = {|
  title: string,
  message: string,
  icon?: string,
|};

export type DesktopNotificationsOptions = {|
  notifier?: typeof defaultNotifier,
  log?: Logger,
|};

export function showDesktopNotification(
  {
    title, message, icon,
  }: DesktopNotificationsParams,
  {
    notifier = defaultNotifier,
    log = defaultLog,
  }: DesktopNotificationsOptions = {}
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

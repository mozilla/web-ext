/* @flow */
import defaultNotifier from 'node-notifier';

import {createLogger} from './logger';

const log = createLogger(__filename);

type desktopNotificationsParams = {
  title: string,
  message: string,
  icon?: string,
};

type desktopNotificationsOpts = {
  notifier?: typeof defaultNotifier,
  logger?: typeof log,
};

export function desktopNotifications(
  {
    title, message, icon,
  }: desktopNotificationsParams,
  {
    notifier = defaultNotifier,
    logger = log,
  }: desktopNotificationsOpts = {}
): void {

  notifier.notify({title, message, icon}, (err, res) => {
    if (err) {
      logger.debug(`notifier error: ${err.message},` +
                   ` response: ${res}`);
    }
  });
}

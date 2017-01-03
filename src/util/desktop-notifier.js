/* @flow */
import {NotificationCenter} from 'node-notifier';

const defaultNotifier = new NotificationCenter({
  withFallback: true,
});

type desktopNotificationsParams = {
  title: string,
  message: string,
  icon?: string,
  notifier?: typeof NotificationCenter,
};

export function desktopNotifications(
  {
    title, message, icon, notifier = defaultNotifier,
  }: desktopNotificationsParams
): void {

  notifier.notify({title, message, icon});
}

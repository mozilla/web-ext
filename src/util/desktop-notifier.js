/* @flow */
import {NotificationCenter} from 'node-notifier';

const notifier = new NotificationCenter({
  withFallback: true,
});

type desktopNotificationsParams = {
  titleString: string,
  messageString: string,
  notifierSource?: NotificationCenter,
};

export function desktopNotifications(
  {
    titleString,
    messageString,
    notifierSource = notifier,
  }: desktopNotificationsParams
): void {

  notifierSource.notify({
    title: titleString,
    message: messageString,
  });
}

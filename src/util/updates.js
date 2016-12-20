/* @flow */
import defaultUpdateNotifier from 'update-notifier';

type checkForUpdatesParams = {
  name: string,
  version: string,
  updateCheckInterval?: number,
  updateNotifier?: typeof defaultUpdateNotifier,
};

export function checkForUpdates({
  name,
  version,
  updateCheckInterval,
  updateNotifier = defaultUpdateNotifier,
}: checkForUpdatesParams
) {
  const pkg = {name: 'web-ext', version};

  updateNotifier({
    pkg,
    updateCheckInterval: 1000 * 60 * 60 * 24 * 7, // 1 week,
  }).notify();
}
/* @flow */
import defaultUpdateNotifier from 'update-notifier';

type checkForUpdatesParams = {|
  version: string,
  updateNotifier?: typeof defaultUpdateNotifier,
|};

export function checkForUpdates(
  {
    version,
    updateNotifier = defaultUpdateNotifier,
  }: checkForUpdatesParams
) {
  const pkg = {name: 'web-ext', version};

  updateNotifier({
    pkg,
    updateCheckInterval: 1000 * 60 * 60 * 24 * 3, // 3 days,
  }).notify();
}
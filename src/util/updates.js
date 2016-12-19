/* @flow */
import defaultUpdateNotifier from 'update-notifier';

type checkForAutomaticUpdatesParams = {
  name: string,
  version: string,
  updateCheckInterval?: number,
  updateNotifier: typeof defaultUpdateNotifier,
};

export function checkForAutomaticUpdates({
  name,
  version,
  updateCheckInterval,
  updateNotifier = defaultUpdateNotifier,
}: checkForAutomaticUpdatesParams
) {
  const pkg = {
    name: name,
    version: version,
  };

  updateNotifier({
    pkg,
    updateCheckInterval: updateCheckInterval,
  }).notify();
}
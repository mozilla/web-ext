/* @flow */
import updateNotifier from 'update-notifier';

type checkForAutomaticUpdatesParams = {
  name: string,
  version: string,
  updateCheckInterval: number,
};

export function checkForAutomaticUpdates({
  name,
  version,
  updateCheckInterval,
}: checkForAutomaticUpdatesParams
) {
  let pkg = {
    name: name,
    version: version,
  };

  updateNotifier({
    pkg,
    updateCheckInterval: updateCheckInterval,
  }).notify();
}
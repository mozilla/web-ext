/* @flow */
import Watchpack from 'watchpack';
import debounce from 'debounce';

import {createLogger} from './util/logger';

const log = createLogger(__filename);


export default function onSourceChange(
    {sourceDir, artifactsDir, onChange, shouldWatchFile}: Object): Watchpack {
  // TODO: For network disks, we would need to add {poll: true}.
  const watcher = new Watchpack();

  const onFileChange = (filePath) => {
    proxyFileChanges({artifactsDir, onChange, filePath, shouldWatchFile});
  };
  const executeImmediately = true;
  watcher.on('change', debounce(onFileChange, 1000, executeImmediately));

  log.debug(`Watching for file changes in ${sourceDir}`);
  watcher.watch([], [sourceDir], Date.now());

  // TODO: support windows See:
  // http://stackoverflow.com/questions/10021373/what-is-the-windows-equivalent-of-process-onsigint-in-node-js
  process.on('SIGINT', () => watcher.close());
  return watcher;
}


export function proxyFileChanges(
    {artifactsDir, onChange, filePath, shouldWatchFile=() => true}
    : Object) {
  if (filePath.indexOf(artifactsDir) === 0 || !shouldWatchFile(filePath)) {
    log.debug(`Ignoring change to: ${filePath}`);
  } else {
    log.info(`Changed: ${filePath}`);
    log.debug(`Last change detection: ${(new Date()).toTimeString()}`);
    onChange();
  }
}

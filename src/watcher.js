/* @flow */
import Watchpack from 'watchpack';
import debounce from 'debounce';

import {createLogger} from './util/logger';
import {FileFilter} from './cmd/build';

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

  // TODO: support interrupting the watcher on Windows.
  // https://github.com/mozilla/web-ext/issues/225
  process.on('SIGINT', () => watcher.close());
  return watcher;
}


export function proxyFileChanges(
    {artifactsDir, onChange, filePath, shouldWatchFile}: Object) {
  if (!shouldWatchFile) {
    const fileFilter = new FileFilter();
    shouldWatchFile = (...args) => fileFilter.wantFile(...args);
  }
  if (filePath.indexOf(artifactsDir) === 0 || !shouldWatchFile(filePath)) {
    log.debug(`Ignoring change to: ${filePath}`);
  } else {
    log.info(`Changed: ${filePath}`);
    log.debug(`Last change detection: ${(new Date()).toTimeString()}`);
    onChange();
  }
}

/* @flow */
import Watchpack from 'watchpack';
import debounce from 'debounce';

import {createLogger} from './util/logger';


const log = createLogger(__filename);


// onSourceChange types and implementation

export type ShouldWatchFn = (filePath: string) => boolean;

export type OnChangeFn = () => any;

export type OnSourceChangeParams = {|
  sourceDir: string,
  artifactsDir: string,
  onChange: OnChangeFn,
  shouldWatchFile: ShouldWatchFn,
|};

// NOTE: this fix an issue with flow and default exports (which currently
// lose their type signatures) by explicitly declare the default export
// signature. Reference: https://github.com/facebook/flow/issues/449
// eslint-disable-next-line no-shadow
declare function exports(params: OnSourceChangeParams): Watchpack;

export type OnSourceChangeFn = (params: OnSourceChangeParams) => Watchpack;

export default function onSourceChange(
  {sourceDir, artifactsDir, onChange, shouldWatchFile}: OnSourceChangeParams
): Watchpack {
  // TODO: For network disks, we would need to add {poll: true}.
  const watcher = new Watchpack();

  const executeImmediately = true;
  onChange = debounce(onChange, 1000, executeImmediately);

  watcher.on('change', (filePath) => {
    proxyFileChanges({artifactsDir, onChange, filePath, shouldWatchFile});
  });

  log.debug(`Watching for file changes in ${sourceDir}`);
  watcher.watch([], [sourceDir], Date.now());

  // TODO: support interrupting the watcher on Windows.
  // https://github.com/mozilla/web-ext/issues/225
  process.on('SIGINT', () => watcher.close());
  return watcher;
}


// proxyFileChanges types and implementation.

export type ProxyFileChangesParams = {|
  artifactsDir: string,
  onChange: OnChangeFn,
  filePath: string,
  shouldWatchFile: ShouldWatchFn,
|};

export function proxyFileChanges(
  {artifactsDir, onChange, filePath, shouldWatchFile}: ProxyFileChangesParams
): void {
  if (filePath.indexOf(artifactsDir) === 0 || !shouldWatchFile(filePath)) {
    log.debug(`Ignoring change to: ${filePath}`);
  } else {
    log.debug(`Changed: ${filePath}`);
    log.debug(`Last change detection: ${(new Date()).toTimeString()}`);
    onChange();
  }
}

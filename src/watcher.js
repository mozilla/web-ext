/* @flow */
import {fs} from 'mz';
import Watchpack from 'watchpack';
import debounce from 'debounce';

import { UsageError } from './errors';
import {createLogger} from './util/logger';


const log = createLogger(__filename);


// onSourceChange types and implementation

export type ShouldWatchFn = (filePath: string) => boolean;

export type OnChangeFn = () => any;

export type OnSourceChangeParams = {|
  sourceDir: string,
  watchFile?: Array<string>,
  watchIgnored?: Array<string>,
  artifactsDir: string,
  onChange: OnChangeFn,
  shouldWatchFile: ShouldWatchFn,
  debounceTime?: number,
|};

// NOTE: this fix an issue with flow and default exports (which currently
// lose their type signatures) by explicitly declare the default export
// signature. Reference: https://github.com/facebook/flow/issues/449
// eslint-disable-next-line no-shadow
declare function exports(params: OnSourceChangeParams): Watchpack;

export type OnSourceChangeFn = (params: OnSourceChangeParams) => Watchpack;

export default function onSourceChange(
  {
    sourceDir,
    watchFile,
    watchIgnored,
    artifactsDir,
    onChange,
    shouldWatchFile,
    debounceTime = 1000,
  }: OnSourceChangeParams
): Watchpack {
  // TODO: For network disks, we would need to add {poll: true}.
  const watcher = watchIgnored ?
    new Watchpack({ignored: watchIgnored}) :
    new Watchpack();

  const executeImmediately = true;
  onChange = debounce(onChange, debounceTime, executeImmediately);

  watcher.on('change', (filePath) => {
    proxyFileChanges({artifactsDir, onChange, filePath, shouldWatchFile});
  });

  log.debug(
    `Watching ${watchFile ? watchFile.join(',') : sourceDir} for changes`
  );

  const watchedDirs = [];
  const watchedFiles = [];

  if (watchFile) {
    for (const filePath of watchFile) {
      if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isFile()) {
        throw new UsageError('Invalid --watch-file value: ' +
          `"${filePath}" is not a file.`);
      }

      watchedFiles.push(filePath);
    }
  } else {
    watchedDirs.push(sourceDir);
  }

  watcher.watch(watchedFiles, watchedDirs, Date.now());

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

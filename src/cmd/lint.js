/* @flow */
import {createLinter as defaultLinterCreator} from '../util/es6-modules';
import {createLogger} from '../util/logger';
import {FileFilter} from './build';

const log = createLogger(__filename);

export default function lint(
    {verbose, sourceDir, selfHosted, boring, output,
     metadata, pretty}: Object,
    {createLinter=defaultLinterCreator, fileFilter=new FileFilter()}
    : Object = {}): Promise {
  log.debug(`Running addons-linter on ${sourceDir}`);
  const linter = createLinter({
    config: {
      logLevel: verbose ? 'debug' : 'fatal',
      stack: Boolean(verbose),
      pretty,
      metadata,
      output,
      boring,
      selfHosted,
      shouldScanFile: (fileName) => fileFilter.wantFile(fileName),
      // This mimics the first command line argument from yargs,
      // which should be the directory to the extension.
      _: [sourceDir],
    },
    runAsBinary: true,
  });
  return linter.run();
}

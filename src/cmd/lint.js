import { createInstance as defaultLinterCreator } from 'addons-linter';

import { createLogger } from '../util/logger.js';
import { createFileFilter as defaultFileFilterCreator } from '../util/file-filter.js';

const log = createLogger(import.meta.url);

// Lint command types and implementation.

export default function lint(
  {
    artifactsDir,
    boring,
    ignoreFiles,
    metadata,
    output,
    pretty,
    privileged,
    sourceDir,
    selfHosted,
    verbose,
    warningsAsErrors,
  },
  {
    createLinter = defaultLinterCreator,
    createFileFilter = defaultFileFilterCreator,
    shouldExitProgram = true,
  } = {},
) {
  const fileFilter = createFileFilter({ sourceDir, ignoreFiles, artifactsDir });

  const config = {
    logLevel: verbose ? 'debug' : 'fatal',
    stack: Boolean(verbose),
    pretty,
    privileged,
    warningsAsErrors,
    metadata,
    output,
    boring,
    selfHosted,
    shouldScanFile: (fileName) => fileFilter.wantFile(fileName),
    minManifestVersion: 2,
    maxManifestVersion: 3,
    enableDataCollectionPermissions: true,
    // This mimics the first command line argument from yargs, which should be
    // the directory to the extension.
    _: [sourceDir],
  };

  log.debug(`Running addons-linter on ${sourceDir}`);
  const linter = createLinter({ config, runAsBinary: shouldExitProgram });
  return linter.run();
}

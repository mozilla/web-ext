/* @flow */
import requireUncached from 'require-uncached';

import {createLogger} from './util/logger';
import {UsageError} from './errors';

const log = createLogger(__filename);

type ApplyConfigToArgvParams = {|
  argv: Object,
  configObject: Object,
  defaultValues: Object,
|};

export function applyConfigToArgv({
  argv,
  configObject,
  defaultValues = {},
}: ApplyConfigToArgvParams): Object {
  const newArgv = {...argv};
  for (const option in configObject) {
    const wasValueSetOnCLI = argv[option] &&
      argv[option] !== defaultValues[option];
    if (wasValueSetOnCLI) {
      log.debug(`Favoring CLI: ${option}=${argv[option]} over ` +
        `configuration: ${option}=${configObject[option]}`);
      continue;
    }
    if (!argv.hasOwnProperty(option) || defaultValues[option]) {
      newArgv[option] = configObject[option];
      log.debug(`Favoring configuration: ${option}=${configObject[option]} ` +
        `over CLI: ${option}=${argv[option]}`);
    }
  }
  return newArgv;
}

export function loadJSConfigFile(filePath: string) {
  log.debug(`Loading JS config file: ${filePath}`);
  try {
    return requireUncached(filePath);
  } catch (error) {
    log.debug('Handling error:', error);
    throw new UsageError(
        `Cannot read config file: ${filePath}\nError: ${error.message}`);
  }
}
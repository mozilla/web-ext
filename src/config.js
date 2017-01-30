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
    const wasValueSetOnCLI = (typeof(newArgv[option]) === 'boolean' ||
      typeof(newArgv[option]) === 'number' ||
      typeof(newArgv[option]) === 'string') &&
      (argv[option] !== defaultValues[option]);
    if (wasValueSetOnCLI) {
      console.log(typeof(argv[option]));
      log.debug(`Favoring CLI: ${option}=${argv[option]} over ` +
        `configuration: ${option}=${configObject[option]}`);
      continue;
    }
    if (!newArgv.hasOwnProperty(option) || defaultValues[option] ||
      typeof(newArgv[option]) === 'boolean' ||
      typeof(newArgv[option]) === 'number') {

      newArgv[option] = configObject[option];
      log.debug(`Favoring configuration: ${option}=${configObject[option]} ` +
        `over CLI: ${option}=${argv[option]}`);
    }
  }
  return newArgv;
}

export function loadJSConfigFile(filePath: string): Object {
  log.debug(`Loading JS config file: ${filePath}`);
  let configObject;
  try {
    configObject = requireUncached(filePath);
  } catch (error) {
    log.debug('Handling error:', error);
    throw new UsageError(
        `Cannot read config file: ${filePath}\nError: ${error.message}`);
  }
  if (Object.keys(configObject).length === 0) {
    log.debug(`Config file ${filePath} did not define any options. ` +
      'Did you set module.exports = {...}?');
  }
  return configObject;
}
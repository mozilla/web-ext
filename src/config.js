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
    // we assume the value was set on the CLI if the default value is
    // not the same as that on the argv object as there is a very rare chance
    // this happening
    const wasValueSetOnCLI = typeof(argv[option]) !== 'undefined' &&
      (argv[option] !== defaultValues[option]);
    if (wasValueSetOnCLI) {
      log.debug(`Favoring CLI: ${option}=${argv[option]} over ` +
        `configuration: ${option}=${configObject[option]}`);
      continue;
    }
    if (!argv.hasOwnProperty(option)) {
      log.debug(`Ignoring configuration: ${option}=${configObject[option]} ` +
        'because this is an unknown option');
      continue;
    }
    newArgv[option] = configObject[option];
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
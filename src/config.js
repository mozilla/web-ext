/* @flow */
import path from 'path';

import requireUncached from 'require-uncached';
import camelCase from 'camelcase';

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
    // of this happening
    if (camelCase(option) !== option) {
      throw new UsageError(`Please use camel case to specify ${option} ` +
        'in the config');
    }
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
      throw new UsageError(`The option ${option} is invalid.` +
        ' Please fix your config and try again.');
    }
    newArgv[option] = configObject[option];
  }
  return newArgv;
}

export function loadJSConfigFile(filePath: string): Object {
  const resolvedFilePath = path.resolve(filePath);
  log.debug(
    `Loading JS config file: "${filePath}" ` +
    `(resolved to "${resolvedFilePath}")`);
  let configObject;
  try {
    configObject = requireUncached(resolvedFilePath);
  } catch (error) {
    log.debug('Handling error:', error);
    throw new UsageError(
      `Cannot read config file: ${resolvedFilePath}\n` +
      `Error: ${error.message}`);
  }
  if (Object.keys(configObject).length === 0) {
    log.debug(`Config file ${resolvedFilePath} did not define any options. ` +
      'Did you set module.exports = {...}?');
  }
  return configObject;
}
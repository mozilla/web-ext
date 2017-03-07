/* @flow */
import path from 'path';

import requireUncached from 'require-uncached';
import camelCase from 'camelcase';
import decamelize from 'decamelize';

import {createLogger} from './util/logger';
import {UsageError} from './errors';

const log = createLogger(__filename);

type ApplyConfigToArgvParams = {|
  argv: Object,
  configObject: Object,
  defaultValues: Object,
  optionTypes: Object,
  configFileName: string,
  commandExecuted?: string,
|};

export function applyConfigToArgv({
  argv,
  configObject,
  defaultValues,
  optionTypes,
  configFileName,
  commandExecuted,
}: ApplyConfigToArgvParams): Object {
  let newArgv = {...argv};
  for (const option in configObject) {

    if (camelCase(option) !== option) {
      throw new UsageError(`The config option "${option}" must be ` +
        `specified in camel case: "${camelCase(option)}"`);
    }

    const optionType = typeof(configObject[option]);

    if (option === commandExecuted) {
      newArgv = applyConfigToArgv({
        argv,
        configObject: configObject[commandExecuted],
        defaultValues: defaultValues[commandExecuted],
        optionTypes,
        configFileName});
      continue;
    }

    if (optionType !== optionTypes[option] &&
      optionTypes[option] !== undefined) {
      throw new UsageError(`The config file at ${configFileName} specified ` +
        `an option of incorrect type: "${option}"`);
    }

    // we assume the value was set on the CLI if the default value is
    // not the same as that on the argv object as there is a very rare chance
    // of this happening
    const wasValueSetOnCLI = typeof(argv[option]) !== 'undefined' &&
      (argv[option] !== defaultValues[option]);
    if (wasValueSetOnCLI) {
      log.debug(`Favoring CLI: ${option}=${argv[option]} over ` +
        `configuration: ${option}=${configObject[option]}`);
      continue;
    }

    if (!argv.hasOwnProperty(decamelize(option, '-'))) {
      throw new UsageError(`The config file at ${configFileName} specified ` +
        `an unknown option: "${option}"`);
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
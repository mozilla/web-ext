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
  subCommandDefaultValues: Object,
  configFileName: string,
  commandExecuted: string,
|};

type ApplySubOptionsToArgvParams = {|
  argv: Object,
  newConfigObj: Object,
  subCommandDefaultValues: Object,
  configFileName: string,
|};

export function applySubOptionsToArgv({
  argv,
  newConfigObj,
  subCommandDefaultValues,
  configFileName,
}: ApplySubOptionsToArgvParams): Object {
  const newArgv = {...argv};
  for (const option in newConfigObj) {
    // we assume the value was set on the CLI if the default value is
    // not the same as that on the argv object as there is a very rare chance
    // of this happening
    if (camelCase(option) !== option) {
      throw new UsageError(`The config option "${option}" must be ` +
        `specified in camel case: "${camelCase(option)}"`);
    }

    const wasValueSetOnCLI = typeof(argv[option]) !== 'undefined' &&
      (argv[option] !== subCommandDefaultValues[option]);
    if (wasValueSetOnCLI) {
      log.debug(`Favoring CLI: ${option}=${argv[option]} over ` +
        `configuration: ${option}=${newConfigObj[option]}`);
      continue;
    }

    if (!argv.hasOwnProperty(decamelize(option, '-'))) {
      throw new UsageError(`The config file at ${configFileName} specified ` +
        `an unknown option: "${option}"`);
    }

    newArgv[option] = newConfigObj[option];
  }
  return newArgv;

}

export function applyConfigToArgv({
  argv,
  configObject,
  defaultValues = {},
  subCommandDefaultValues,
  configFileName,
  commandExecuted,
}: ApplyConfigToArgvParams): Object {
  const newArgv = {...argv};
  let adjustedArgv;
  for (const option in configObject) {
    // we assume the value was set on the CLI if the default value is
    // not the same as that on the argv object as there is a very rare chance
    // of this happening
    if (camelCase(option) !== option) {
      throw new UsageError(`The config option "${option}" must be ` +
        `specified in camel case: "${camelCase(option)}"`);
    }
    if (option === commandExecuted) {
      const newConfigObj = configObject[option];
      adjustedArgv = applySubOptionsToArgv({
        argv,
        newConfigObj,
        subCommandDefaultValues,
        configFileName});
      continue;
    }

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
  return {...newArgv, ...adjustedArgv};
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
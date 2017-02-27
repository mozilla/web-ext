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
  defaultValues?: Object,
  subCommandDefaultValues: Object,
  configFileName: string,
  commandExecuted?: string,
|};

export function applyConfigToArgv({
  argv,
  configObject,
  defaultValues = {},
  subCommandDefaultValues,
  configFileName,
  commandExecuted,
}: ApplyConfigToArgvParams): Object {
  let newArgv = {...argv};
  for (const option in configObject) {

    validateOption(option);
    if (option === commandExecuted) {
      configObject = configObject[option];
      newArgv = applyConfigToArgv({
        argv,
        configObject,
        subCommandDefaultValues,
        configFileName});
      continue;
    }

    if (defaultValues[option] === undefined && subCommandDefaultValues) {
      defaultValues = subCommandDefaultValues;
    }

    if (wasValueSetOnCLI(option, argv[option], defaultValues[option],
      configObject[option])) {
      continue;
    }

    checkOptionPresence(argv, option, configFileName);

    newArgv[option] = configObject[option];
  }
  return newArgv;
}

function checkOptionPresence(argv: Object, option: string,
  configFileName: string) {
  if (!argv.hasOwnProperty(decamelize(option, '-'))) {
    throw new UsageError(`The config file at ${configFileName} specified ` +
      `an unknown option: "${option}"`);
  }

}

function validateOption(option: string) {
  if (camelCase(option) !== option) {
    throw new UsageError(`The config option "${option}" must be ` +
      `specified in camel case: "${camelCase(option)}"`);
  }
}

function wasValueSetOnCLI(optionName: string, optionValue: string,
  defaultValue: string, configOption: string) {
  // we assume the value was set on the CLI if the default value is
  // not the same as that on the argv object as there is a very rare chance
  // of this happening
  const setOnCLI = typeof(optionValue) !== 'undefined' &&
  (optionValue !== defaultValue);

  if (setOnCLI) {
    log.debug(`Favoring CLI: ${optionName}=${optionValue} over ` +
      `configuration: ${optionName}=${configOption}`);
  }
  return setOnCLI;

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
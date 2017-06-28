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
  options: Object,
  configFileName: string,
  commandExecuted?: string,
|};

export function applyConfigToArgv({
  argv,
  configObject,
  options,
  configFileName,
  commandExecuted,
}: ApplyConfigToArgvParams): Object {
  let newArgv = {...argv};
  for (const option in configObject) {

    if (camelCase(option) !== option) {
      throw new UsageError(`The config option "${option}" must be ` +
        `specified in camel case: "${camelCase(option)}"`);
    }

    if (option === commandExecuted ||
        options.mainCommandsList.includes(option)) {
      newArgv = applyConfigToArgv({
        argv,
        configObject: configObject[option],
        options,
        configFileName});
      continue;
    }

    const decamelizedOptName = decamelize(option, '-');
    let expectedType;
    if (options[decamelizedOptName]) {
      if (options[decamelizedOptName].type === undefined) {
        throw new UsageError
          (`Option: ${option} was defined without a type.`);
      } else {
        expectedType = options[decamelizedOptName].type ===
        ' count' ? 'number' : options[decamelizedOptName].type;
      }
    }

    if (configObject[option]) {
      const optionType = typeof(configObject[option]);
      if (optionType !== expectedType &&
        expectedType !== undefined &&
        !(expectedType === 'count' && optionType === 'number')) {
        throw new UsageError(`The config file at ${configFileName} specified ` +
          `the type of "${option}" incorrectly as "${optionType}"` +
          ` (expected type: "${expectedType}")`);
      }
    }

    // we assume the value was set on the CLI if the default value is
    // not the same as that on the argv object as there is a very rare chance
    // of this happening

    let defaultValue;
    if (options[decamelizedOptName] && options[decamelizedOptName].type) {
      if (options[decamelizedOptName].type === 'boolean') {
        defaultValue = false;
      } else if (options[decamelizedOptName].default !== undefined) {
        defaultValue = options[decamelizedOptName].default;
      }
    }

    const wasValueSetOnCLI = typeof(argv[option]) !== 'undefined' &&
      (argv[option] !== defaultValue);
    if (wasValueSetOnCLI) {
      log.debug(`Favoring CLI: ${option}=${argv[option]} over ` +
        `configuration: ${option}=${configObject[option]}`);
      continue;
    }

    if (options && !Object.keys(options).includes(decamelizedOptName) &&
        !options.mainCommandsList.includes(decamelizedOptName)) {
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
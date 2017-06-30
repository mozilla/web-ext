/* @flow */
import path from 'path';

import requireUncached from 'require-uncached';
import camelCase from 'camelcase';
import decamelize from 'decamelize';

import {createLogger} from './util/logger';
import {UsageError, WebExtError} from './errors';

const log = createLogger(__filename);

type ApplyConfigToArgvParams = {|
  argv: Object,
  configObject: Object,
  options: Object,
  configFileName: string,
|};

export function applyConfigToArgv({
  argv,
  configObject,
  options,
  configFileName,
}: ApplyConfigToArgvParams): Object {
  let newArgv = {...argv};
  for (const option in configObject) {

    if (camelCase(option) !== option) {
      throw new UsageError(`The config option "${option}" must be ` +
        `specified in camel case: "${camelCase(option)}"`);
    }

    if (typeof options[option] === 'object' &&
      typeof configObject[option] === 'object') {
      // Descend into the nested configuration for a sub-command.
      newArgv = applyConfigToArgv({
        argv,
        configObject: configObject[option],
        options: options[option],
        configFileName});
      continue;
    }

    const decamelizedOptName = decamelize(option, '-');

    if (typeof options[decamelizedOptName] !== 'object') {
      throw new UsageError(`The config file at ${configFileName} specified ` +
        `an unknown option: "${option}"`);
    }
    if (options[decamelizedOptName].type === undefined) {
      throw new WebExtError(
        `Option: ${option} was defined without a type.`);
    }

    const expectedType = options[decamelizedOptName].type ===
      'count' ? 'number' : options[decamelizedOptName].type;

    const optionType = typeof configObject[option];
    if (optionType !== expectedType) {
      throw new UsageError(`The config file at ${configFileName} specified ` +
        `the type of "${option}" incorrectly as "${optionType}"` +
        ` (expected type: "${expectedType}")`);
    }

    let defaultValue;
    if (options[decamelizedOptName]) {
      if (options[decamelizedOptName].default !== undefined) {
        defaultValue = options[decamelizedOptName].default;
      } else if (expectedType === 'boolean') {
        defaultValue = false;
      }
    }

    // we assume the value was set on the CLI if the default value is
    // not the same as that on the argv object as there is a very rare chance
    // of this happening

    const wasValueSetOnCLI = typeof(argv[option]) !== 'undefined' &&
      (argv[option] !== defaultValue);
    if (wasValueSetOnCLI) {
      log.debug(`Favoring CLI: ${option}=${argv[option]} over ` +
        `configuration: ${option}=${configObject[option]}`);
      continue;
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
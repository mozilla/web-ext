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
  configFileName: string,
  commandExecuted: string,
|};

type ApplySubOptionsToArgvParams = {|
  commandExecuted: string,
  argv: Object,
  mapCommandToSubOpts: Object,
  configObject: Object,
  defaultValues: Object,
  configFileName: string,
|};

export function applySubOptionsToArgv({
  commandExecuted,
  argv,
  mapCommandToSubOpts,
  configObject,
  defaultValues,
  configFileName,
}: ApplySubOptionsToArgvParams): Object {
  // cannot use spread operator because Flow complains. See: https://github.com/facebook/flow/pull/3381/
  const newArgv = JSON.parse(JSON.stringify(argv));
  if (mapCommandToSubOpts[commandExecuted]) {
    for (const opt in mapCommandToSubOpts) {
      newArgv[opt] = mapCommandToSubOpts[opt];
    }
  }
  const adjustedArgv = applyConfigToArgv(newArgv, configObject,
    defaultValues, configFileName);
  return adjustedArgv;
}

export function applyConfigToArgv({
  argv,
  configObject,
  defaultValues = {},
  configFileName,
  commandExecuted,
}: ApplyConfigToArgvParams): Object {
  const newArgv = {...argv};
  for (const option in configObject) {
    // we assume the value was set on the CLI if the default value is
    // not the same as that on the argv object as there is a very rare chance
    // of this happening
    if (camelCase(option) !== option) {
      throw new UsageError(`The config option "${option}" must be ` +
        `specified in camel case: "${camelCase(option)}"`);
    }

    if (option === commandExecuted) {
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
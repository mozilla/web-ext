/* @flow */
import os from 'os';
import path from 'path';

import importFresh from 'import-fresh';
import camelCase from 'camelcase';
import decamelize from 'decamelize';

import fileExists from './util/file-exists';
import {createLogger} from './util/logger';
import {UsageError, WebExtError} from './errors';

const log = createLogger(__filename);

type ApplyConfigToArgvParams = {|
  // This is the argv object which will get updated by each
  // config applied.
  argv: Object,
  // This is the argv that only has CLI values applied to it.
  argvFromCLI: Object,
  configObject: Object,
  options: Object,
  configFileName: string,
|};

export function applyConfigToArgv({
  argv,
  argvFromCLI,
  configObject,
  options,
  configFileName,
}: ApplyConfigToArgvParams): Object {
  let newArgv = {...argv};

  for (const option of Object.keys(configObject)) {
    if (camelCase(option) !== option) {
      throw new UsageError(
        `The config option "${option}" must be ` +
        `specified in camel case: "${camelCase(option)}"`);
    }

    // A config option cannot be a sub-command config
    // object if it is an array.
    if (!Array.isArray(configObject[option]) &&
      typeof options[option] === 'object' &&
      typeof configObject[option] === 'object') {
      // Descend into the nested configuration for a sub-command.
      newArgv = applyConfigToArgv({
        argv: newArgv,
        argvFromCLI,
        configObject: configObject[option],
        options: options[option],
        configFileName});
      continue;
    }

    const decamelizedOptName = decamelize(option, {separator: '-'});

    if (typeof options[decamelizedOptName] !== 'object') {
      throw new UsageError(`The config file at ${configFileName} specified ` +
        `an unknown option: "${option}"`);
    }
    if (options[decamelizedOptName].type === undefined) {
      // This means yargs option type wasn't not defined correctly
      throw new WebExtError(
        `Option: ${option} was defined without a type.`);
    }

    const expectedType = options[decamelizedOptName].type ===
      'count' ? 'number' : options[decamelizedOptName].type;

    const optionType = (
      Array.isArray(configObject[option]) ?
        'array' : typeof configObject[option]
    );

    if (optionType !== expectedType) {
      throw new UsageError(`The config file at ${configFileName} specified ` +
        `the type of "${option}" incorrectly as "${optionType}"` +
        ` (expected type "${expectedType}")`);
    }

    let defaultValue;
    if (options[decamelizedOptName]) {
      if (options[decamelizedOptName].default !== undefined) {
        defaultValue = options[decamelizedOptName].default;
      } else if (expectedType === 'boolean') {
        defaultValue = false;
      }
    }

    // This is our best effort (without patching yargs) to detect
    // if a value was set on the CLI instead of in the config.
    // It looks for a default value and if the argv value is
    // different, it assumes that the value was configured on the CLI.

    const wasValueSetOnCLI =
      typeof argvFromCLI[option] !== 'undefined' &&
      argvFromCLI[option] !== defaultValue;
    if (wasValueSetOnCLI) {
      log.debug(
        `Favoring CLI: ${option}=${argvFromCLI[option]} over ` +
        `configuration: ${option}=${configObject[option]}`);
      newArgv[option] = argvFromCLI[option];
      continue;
    }

    newArgv[option] = configObject[option];

    const coerce = options[decamelizedOptName].coerce;
    if (coerce) {
      log.debug(
        `Calling coerce() on configured value for ${option}`);
      newArgv[option] = coerce(newArgv[option]);
    }

    newArgv[decamelizedOptName] = newArgv[option];
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
    configObject = importFresh(resolvedFilePath);
  } catch (error) {
    log.debug('Handling error:', error);
    throw new UsageError(
      `Cannot read config file: ${resolvedFilePath}\n` +
      `Error: ${error.message}`);
  }
  if (filePath.endsWith('package.json')) {
    log.debug('Looking for webExt key inside package.json file');
    configObject = configObject.webExt || {};
  }
  if (Object.keys(configObject).length === 0) {
    log.debug(`Config file ${resolvedFilePath} did not define any options. ` +
      'Did you set module.exports = {...}?');
  }
  return configObject;
}

type DiscoverConfigFilesParams = {|
  getHomeDir: () => string,
|};

export async function discoverConfigFiles(
  {getHomeDir = os.homedir}: DiscoverConfigFilesParams = {}
): Promise<Array<string>> {
  const magicConfigName = 'web-ext-config.js';

  // Config files will be loaded in this order.
  const possibleConfigs = [
    // Look for a magic hidden config (preceded by dot) in home dir.
    path.join(getHomeDir(), `.${magicConfigName}`),
    // Look for webExt key inside package.json file
    path.join(process.cwd(), 'package.json'),
    // Look for a magic config in the current working directory.
    path.join(process.cwd(), magicConfigName),
  ];

  const configs = await Promise.all(possibleConfigs.map(
    async (fileName) => {
      const resolvedFileName = path.resolve(fileName);
      if (await fileExists(resolvedFileName)) {
        return resolvedFileName;
      } else {
        log.debug(
          `Discovered config "${resolvedFileName}" does not ` +
          'exist or is not readable');
        return undefined;
      }
    }
  ));

  const existingConfigs = [];
  configs.forEach((f) => {
    if (typeof f === 'string') {
      existingConfigs.push(f);
    }
  });
  return existingConfigs;
}

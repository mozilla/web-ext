/* @flow */
import path from 'path';

import requireUncached from 'require-uncached';

import {createLogger} from './util/logger';
import {UsageError} from './errors';

const log = createLogger(__filename);

type ApplyConfigToArgvParams = {
  argv: Object,
  configObject?: Object,
  configFileName?: string,
  defaultValues?: Object,
};

type ParseConfigParams = {
  argv: Object,
  configFileName: string,
}

export function applyConfigToArgv({
  argv,
  configObject,
  configFileName,
  defaultValues = {},
}: ApplyConfigToArgvParams): Object {
  if (configFileName) {
    configObject = parseConfig(argv, configFileName);
  }
  for (const option in configObject) {
    if (!argv.hasOwnProperty(option) || defaultValues[option]) {
      argv[option] = configObject[option];
    }
  }
  return argv;
}

export function parseConfig({
  argv,
  configFileName,
}: ParseConfigParams) {
  let configObject;
  if (configFileName) {
    const configFilePath = path.join(`/${argv.sourceDir}`, configFileName);
    configObject = loadJSConfigFile(configFilePath);
  }
  return configObject;
}

export function loadJSConfigFile(filePath: string) {
  log.debug(`Loading JS config file: ${filePath}`);
  try {
    return requireUncached(filePath);
  } catch (e) {
    log.debug(`Error reading JavaScript file: ${filePath}`);
    e.message = `Cannot read config file: ${filePath}\nError: ${e.message}`;
    throw new UsageError(e);
  }
}
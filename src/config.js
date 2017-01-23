/* @flow */
import path from 'path';

import requireUncached from 'require-uncached';

import {createLogger} from './util/logger';
import {UsageError} from './errors';

const log = createLogger(__filename);

type ApplyConfigToArgvParams = {|
  argv: Object,
  configObject: Object,
  defaultValues?: Object,
|};

type ParseConfigParams = {|
  argv: Object,
  configFileName: string,
|};

export function applyConfigToArgv({
  argv,
  configObject,
  defaultValues = {},
}: ApplyConfigToArgvParams): Object {
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
  } catch (error) {
    log.debug('Handling error:', error);
    throw new UsageError
        (`Cannot read config file: ${filePath}\nError: ${error.message}`);
  }
}
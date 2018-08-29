/* @flow */
import path from 'path';
import {createWriteStream} from 'fs';

import {fs} from 'mz';
import parseJSON from 'parse-json';
import stripJsonComments from 'strip-json-comments';
import defaultEventToPromise from 'event-to-promise';

import defaultSourceWatcher from '../watcher';
import {zipDir} from '../util/zip-dir';
import getValidatedManifest, {getManifestId} from '../util/manifest';
import {prepareArtifactsDir} from '../util/artifacts';
import {createLogger} from '../util/logger';
import {UsageError, isErrorWithCode} from '../errors';
import {
  createFileFilter as defaultFileFilterCreator,
  FileFilter,
} from '../util/file-filter';
// Import flow types.
import type {OnSourceChangeFn} from '../watcher';
import type {ExtensionManifest} from '../util/manifest';
import type {FileFilterCreatorFn} from '../util/file-filter';

const log = createLogger(__filename);


export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '_');
}


// defaultPackageCreator types and implementation.

export type ExtensionBuildResult = {|
  extensionPath: string,
|};

export type PackageCreatorParams = {|
  manifestData?: ExtensionManifest,
  sourceDir: string,
  fileFilter: FileFilter,
  artifactsDir: string,
  overwriteDest: boolean,
  showReadyMessage: boolean
|};

export type LocalizedNameParams = {|
  messageFile: string,
  manifestData: ExtensionManifest,
|}

export type PackageCreatorOptions = {|
  eventToPromise: typeof defaultEventToPromise,
|};

// This defines the _locales/messages.json type. See:
// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Internationalization#Providing_localized_strings_in__locales
type LocalizedMessageData = {|
  [messageName: string]: {|
    description: string,
    message: string,
  |},
|}

export async function getDefaultLocalizedName(
  {messageFile, manifestData}: LocalizedNameParams
): Promise<string> {

  let messageData: LocalizedMessageData;
  let messageContents: string | Buffer;
  let extensionName: string = manifestData.name;

  try {
    messageContents = await fs.readFile(messageFile, {encoding: 'utf-8'});
  } catch (error) {
    throw new UsageError(
      `Error reading messages.json file at ${messageFile}: ${error}`);
  }

  try {
    messageData = parseJSON(stripJsonComments(messageContents), messageFile);
  } catch (error) {
    throw new UsageError(
      `Error parsing messages.json ${error}`);
  }

  extensionName = manifestData.name.replace(
    /__MSG_([A-Za-z0-9@_]+?)__/g,
    (match, messageName) => {
      if (!(messageData[messageName]
            && messageData[messageName].message)) {
        const error = new UsageError(
          `The locale file ${messageFile} ` +
            `is missing key: ${messageName}`);
        throw error;
      } else {
        return messageData[messageName].message;
      }
    });
  return Promise.resolve(extensionName);
}

export type PackageCreatorFn =
    (params: PackageCreatorParams) => Promise<ExtensionBuildResult>;

export async function defaultPackageCreator(
  {
    manifestData,
    sourceDir,
    fileFilter,
    artifactsDir,
    overwriteDest,
    showReadyMessage,
  }: PackageCreatorParams,
  {
    eventToPromise = defaultEventToPromise,
  }: PackageCreatorOptions = {}
): Promise<ExtensionBuildResult> {
  let id;
  if (manifestData) {
    id = getManifestId(manifestData);
    log.debug(`Using manifest id=${id || '[not specified]'}`);
  } else {
    manifestData = await getValidatedManifest(sourceDir);
  }

  const buffer = await zipDir(sourceDir, {
    filter: (...args) => fileFilter.wantFile(...args),
  });

  let extensionName: string = manifestData.name;

  if (manifestData.default_locale) {
    const messageFile = path.join(
      sourceDir, '_locales',
      manifestData.default_locale, 'messages.json'
    );
    log.debug('Manifest declared default_locale, localizing extension name');
    extensionName = await getDefaultLocalizedName({
      messageFile, manifestData,
    });
  }
  const packageName = safeFileName(
    `${extensionName}-${manifestData.version}.zip`);
  const extensionPath = path.join(artifactsDir, packageName);

  // Added 'wx' flags to avoid overwriting of existing package.
  let stream = createWriteStream(extensionPath, {flags: 'wx'});

  stream.write(buffer, () => stream.end());

  try {
    await eventToPromise(stream, 'close');
  } catch (error) {
    if (!isErrorWithCode('EEXIST', error)) {
      throw error;
    }
    if (!overwriteDest) {
      throw new UsageError(
        `Extension exists at the destination path: ${extensionPath}\n` +
        'Use --overwrite-dest to enable overwriting.');
    }
    log.info(`Destination exists, overwriting: ${extensionPath}`);
    stream = createWriteStream(extensionPath);
    stream.write(buffer, () => stream.end());
    await eventToPromise(stream, 'close');
  }

  if (showReadyMessage) {
    log.info(`Your web extension is ready: ${extensionPath}`);
  }
  return {extensionPath};
}


// Build command types and implementation.

export type BuildCmdParams = {|
  sourceDir: string,
  artifactsDir: string,
  asNeeded?: boolean,
  overwriteDest?: boolean,
  ignoreFiles?: Array<string>,
|};

export type BuildCmdOptions = {|
  manifestData?: ExtensionManifest,
  fileFilter?: FileFilter,
  onSourceChange?: OnSourceChangeFn,
  packageCreator?: PackageCreatorFn,
  showReadyMessage?: boolean,
  createFileFilter?: FileFilterCreatorFn,
  shouldExitProgram?: boolean,
|};

export default async function build(
  {
    sourceDir,
    artifactsDir,
    asNeeded = false,
    overwriteDest = false,
    ignoreFiles = [],
  }: BuildCmdParams,
  {
    manifestData,
    createFileFilter = defaultFileFilterCreator,
    fileFilter = createFileFilter({
      sourceDir,
      artifactsDir,
      ignoreFiles,
    }),
    onSourceChange = defaultSourceWatcher,
    packageCreator = defaultPackageCreator,
    showReadyMessage = true,
  }: BuildCmdOptions = {}
): Promise<ExtensionBuildResult> {

  const rebuildAsNeeded = asNeeded; // alias for `build --as-needed`
  log.info(`Building web extension from ${sourceDir}`);

  const createPackage = () => packageCreator({
    manifestData,
    sourceDir,
    fileFilter,
    artifactsDir,
    overwriteDest,
    showReadyMessage,
  });

  await prepareArtifactsDir(artifactsDir);
  const result = await createPackage();

  if (rebuildAsNeeded) {
    log.info('Rebuilding when files change...');
    onSourceChange({
      sourceDir,
      artifactsDir,
      onChange: () => {
        return createPackage().catch((error) => {
          log.error(error.stack);
          throw error;
        });
      },
      shouldWatchFile: (...args) => fileFilter.wantFile(...args),
    });
  }

  return result;
}

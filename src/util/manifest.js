/* @flow */
import path from 'path';

import {fs} from 'mz';
import parseJSON from 'parse-json';
import stripJsonComments from 'strip-json-comments';

import {InvalidManifest} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);


// getValidatedManifest helper types and implementation

export type ExtensionManifestApplications = {|
  gecko: {|
    id?: string,
    strict_min_version?: string,
    strict_max_version?: string,
    update_url?: string,
  |},
|};

export type ExtensionManifest = {|
  name: string,
  version: string,
  default_locale?: string,
  applications?: ExtensionManifestApplications,
|};

export default async function getValidatedManifest(
  sourceDir: string
): Promise<ExtensionManifest> {
  const manifestFile = path.join(sourceDir, 'manifest.json');
  log.debug(`Validating manifest at ${manifestFile}`);

  let manifestContents;

  try {
    manifestContents = await fs.readFile(manifestFile, {encoding: 'utf-8'});
  } catch (error) {
    throw new InvalidManifest(
      `Could not read manifest.json file at ${manifestFile}: ${error}`);
  }

  let manifestData;

  try {
    manifestData = parseJSON(stripJsonComments(manifestContents), manifestFile);
  } catch (error) {
    throw new InvalidManifest(
      `Error parsing manifest.json at ${manifestFile}: ${error}`);
  }

  const errors = [];
  // This is just some basic validation of what web-ext needs, not
  // what Firefox will need to run the extension.
  // TODO: integrate with the addons-linter for actual validation.
  if (!manifestData.name) {
    errors.push('missing "name" property');
  }
  if (!manifestData.version) {
    errors.push('missing "version" property');
  }

  if (manifestData.applications && !manifestData.applications.gecko) {
    // Since the applications property only applies to gecko, make
    // sure 'gecko' exists when 'applications' is defined. This should
    // make introspection of gecko properties easier.
    errors.push('missing "applications.gecko" property');
  }

  if (errors.length) {
    throw new InvalidManifest(
      `Manifest at ${manifestFile} is invalid: ${errors.join('; ')}`);
  }

  return manifestData;
}


export function getManifestId(manifestData: ExtensionManifest): string | void {
  return manifestData.applications ?
    manifestData.applications.gecko.id : undefined;
}

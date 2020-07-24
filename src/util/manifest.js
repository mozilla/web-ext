/* @flow */
import path from 'path';

import {fs} from 'mz';
import parseJSON from 'parse-json';
import stripBom from 'strip-bom';
import stripJsonComments from 'strip-json-comments';

import {InvalidManifest} from '../errors';
import {createLogger} from './logger';

const log = createLogger(__filename);


// getValidatedManifest helper types and implementation

export type ExtensionManifestApplications = {|
  gecko?: {|
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
  browser_specific_settings?: ExtensionManifestApplications,
  permissions?: Array<string>,
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

  manifestContents = stripBom(manifestContents);

  let manifestData;

  try {
    manifestData = parseJSON(stripJsonComments(manifestContents));
  } catch (error) {
    throw new InvalidManifest(
      `Error parsing manifest.json file at ${manifestFile}: ${error}`);
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
  const manifestApps = [
    manifestData.browser_specific_settings,
    manifestData.applications,
  ];
  for (const apps of manifestApps) {
    // If both bss and applicants contains a defined gecko property,
    // we prefer bss even if the id property isn't available.
    // This match what Firefox does in this particular scenario, see
    // https://searchfox.org/mozilla-central/rev/828f2319c0195d7f561ed35533aef6fe183e68e3/toolkit/mozapps/extensions/internal/XPIInstall.jsm#470-474,488
    if (apps?.gecko) {
      return apps.gecko.id;
    }
  }

  return undefined;
}

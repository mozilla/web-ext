/* @flow */
import * as fs from './promised-fs';
import {InvalidManifest} from '../errors';


export default function getValidatedManifest(manifestFile: string): Promise {
  return fs.readFile(manifestFile)
    .catch((error) => {
      throw new InvalidManifest(
        `Could not read manifest.json file: ${error}`);
    })
    .then((manifestContents) => JSON.parse(manifestContents))
    .catch((error) => {
      throw new InvalidManifest(
        `Error parsing manifest.json at ${manifestFile}: ${error}`);
    })
    .then((manifestData) => {
      let errors = [];
      // This is just some basic validation of what web-ext needs, not
      // what Firefox will need to run the extension.
      // TODO: integrate with the addons-linter for actual validation.
      if (!manifestData.name) {
        errors.push('missing "name" property');
      }
      if (!manifestData.version) {
        errors.push('missing "version" property');
      }
      if (errors.length) {
        throw new InvalidManifest(
          `Manifest at ${manifestFile} is invalid: ${errors.join('; ')}`);
      }
      return manifestData;
    });
}

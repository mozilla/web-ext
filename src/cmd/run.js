/* @flow */
import buildExtension from './build';
import * as defaultFirefox from '../firefox';
import {withTempDir} from '../util/temp-dir';
import getValidatedManifest from '../util/manifest';


export default function run(
    {sourceDir, firefoxBinary, firefoxProfile}: Object,
    {firefox=defaultFirefox}: Object = {}): Promise {

  console.log(`Running web extension from ${sourceDir}`);

  return getValidatedManifest(sourceDir)
    .then((manifestData) => withTempDir(
      (tmpDir) =>
        Promise.all([
          buildExtension({sourceDir, artifactsDir: tmpDir.path()},
                         {manifestData}),
          new Promise((resolve) => {
            if (firefoxProfile) {
              console.log(`Copying Firefox profile from ${firefoxProfile}`);
              resolve(firefox.copyProfile(firefoxProfile));
            } else {
              console.log('Creating new Firefox profile');
              resolve(firefox.createProfile());
            }
          }),
        ])
        .then((result) => {
          let [buildResult, profile] = result;
          return firefox.installExtension(
            {
              manifestData,
              extensionPath: buildResult.extensionPath,
              profile,
            })
            .then(() => profile);
        })
        .then((profile) => firefox.run(profile, {firefoxBinary}))
    ));
}

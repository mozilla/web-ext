/* @flow */
import buildExtension from './build';
import {ProgramOptions} from '../program';
import * as defaultFirefox from '../firefox';
import {withTempDir} from '../util/temp-dir';
import getValidatedManifest from '../util/manifest';


export default function run(
    {sourceDir}: ProgramOptions,
    {firefox=defaultFirefox}: Object = {}): Promise {

  console.log(`Running web extension from ${sourceDir}`);

  return getValidatedManifest(sourceDir)
    .then((manifestData) => withTempDir(
      (tmpDir) =>
        Promise.all([
          buildExtension({sourceDir, buildDir: tmpDir.path()},
                         {manifestData}),
          firefox.createProfile(),
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
        .then((profile) => firefox.run(profile))
    ));
}

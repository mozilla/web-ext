/* @flow */
import build from '../../../src/cmd/build';
import {TempDir} from '../../../src/util/temp-dir';
import {fixturePath} from '../../helpers';


export function buildMinimalExt(tmpDir: TempDir): Promise {
  return build({
    sourceDir: fixturePath('minimal-web-ext'),
    buildDir: tmpDir.path(),
  });
}


export function buildMinimalExtWithManifest(
    tmpDir: TempDir, manifestData: Object): Promise {
  return build({
    sourceDir: fixturePath('minimal-web-ext'),
    buildDir: tmpDir.path(),
  }, {
    manifestData: manifestData,
  });
}

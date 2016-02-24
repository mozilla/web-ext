/* @flow */
import build, {getPackageBasename} from '../../../src/cmd/build';
import {fixturePath, TempDir} from '../../helpers';


export function buildMinimalExt(tmpDir: TempDir): Promise {
  return build({
    sourceDir: fixturePath('minimal-web-ext'),
    buildDir: tmpDir.path(),
  });
}


export function getMinimalExtBasename(): Promise {
  let sourceDir = fixturePath('minimal-web-ext');
  return getPackageBasename(sourceDir);
}

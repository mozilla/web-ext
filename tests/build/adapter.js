/* @flow */
import build from '../../src/build';
import {fixturePath, TempDir} from '../util';


export function buildMinimalExt(tmpDir: TempDir): Promise {
  return build({
    sourceDir: fixturePath('minimal-web-ext'),
    buildDir: tmpDir.path(),
  });
}

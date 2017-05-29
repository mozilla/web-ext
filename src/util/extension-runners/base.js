/* @flow */

import type {ExtensionManifest} from '../manifest';

export type Extension = {|
  sourceDir: string,
  manifestData: ExtensionManifest,
|};

export type ExtensionRunnerParams = {
  extensions: Array<Extension>,
  profilePath?: string,
  keepProfileChanges: boolean,
  startUrl: ?string | ?Array<string>,
};

export interface IExtensionRunner {
  run(): Promise<void>,
  reloadAllExtensions(): Promise<void>,
  reloadExtensionBySourceDir(extensionSourceDir: string): Promise<void>,
  registerCleanup(fn: Function): void,
  exit(): Promise<void>
}

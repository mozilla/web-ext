/* @flow */

import {
  showDesktopNotification as defaultDesktopNotifications,
} from '../util/desktop-notifier';
import type {ExtensionManifest} from '../util/manifest';

export type Extension = {|
  sourceDir: string,
  manifestData: ExtensionManifest,
|};

export type ExtensionRunnerParams = {|
  // Common cli params.
  extensions: Array<Extension>,
  profilePath?: string,
  keepProfileChanges: boolean,
  startUrl: ?string | ?Array<string>,
  args?: Array<string>,

  // Common injected dependencies.
  desktopNotifications: typeof defaultDesktopNotifications,
|};

export type ExtensionRunnerReloadResult = {|
  runnerName: string,
  reloadError?: Error,
  sourceDir?: string,
|};

export interface IExtensionRunner {
  getName(): string,
  run(): Promise<void>,
  reloadAllExtensions(): Promise<Array<ExtensionRunnerReloadResult>>,
  reloadExtensionBySourceDir(
    extensionSourceDir: string
  ): Promise<Array<ExtensionRunnerReloadResult>>,
  registerCleanup(fn: Function): void,
  exit(): Promise<void>,
}

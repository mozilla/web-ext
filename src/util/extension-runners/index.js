/* @flow */

import {
  default as createFirefoxDesktopExtensionRunner,
} from './firefox-desktop';
import {createLogger} from '../logger';
import type {
  IExtensionRunner,  // eslint-disable-line import/named
  ExtensionRunnerParams,
} from './base';
import type {
  FirefoxDesktopExtensionRunnerParams,
  FirefoxDesktopExtensionRunnerDeps,
} from './firefox-desktop';

export type ExtensionRunnerAllParams =
  ExtensionRunnerParams &
  FirefoxDesktopExtensionRunnerParams & {
    targets: Array<string>,
  };

export type ExtensionRunnerAllDeps =
  FirefoxDesktopExtensionRunnerDeps & {
    extensionRunnerFactories?: {
      [key: string]: (any, any) => IExtensionRunner,
    },
  };

export default function createExtensionRunner(
  params: ExtensionRunnerAllParams,
  injectedDeps: ExtensionRunnerAllDeps,
): IExtensionRunner {
  return new MultipleTargetsExtensionRunner(params, injectedDeps);
}

const log = createLogger(__filename);

// Collection of the supported extension runners.
const defaultExtensionRunnerFactories = {
  'firefox-desktop': createFirefoxDesktopExtensionRunner,
};

export class MultipleTargetsExtensionRunner {
  params: ExtensionRunnerAllParams;
  deps: ExtensionRunnerAllDeps;
  extensionRunners: Array<IExtensionRunner>;

  constructor(
    params: ExtensionRunnerAllParams,
    deps: ExtensionRunnerAllDeps,
  ) {
    this.params = params;
    this.deps = deps;
    this.extensionRunners = [];

    if (!deps.extensionRunnerFactories) {
      deps.extensionRunnerFactories = defaultExtensionRunnerFactories;
    }

    const {targets} = params;
    if (!targets || targets.length === 0) {
      this.extensionRunners.push(
        deps.extensionRunnerFactories['firefox-desktop'](params, deps)
      );
    } else {
      for (const target of targets) {
        const createRunner = deps.extensionRunnerFactories[target];
        if (createRunner) {
          this.extensionRunners.push(createRunner(params, deps));
        } else {
          log.warn(`No extension runner has been found for ${target}`);
        }
      }
    }

    if (this.extensionRunners.length === 0) {
      throw new Error(
        'None of the requested extension runner targets is available'
      );
    }
  }

  async run(): Promise<void> {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.run());
    }

    await Promise.all(promises);
  }

  async reloadAllExtensions(): Promise<void> {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.reloadAllExtensions());
    }

    await Promise.all(promises);
  }

  async reloadExtensionBySourceDir(sourceDir: string): Promise<void> {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.reloadExtensionBySourceDir(sourceDir));
    }

    await Promise.all(promises);
  }

  registerCleanup(fn: Function): void {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(new Promise((resolve) => {
        runner.registerCleanup(resolve);
      }));
    }

    Promise.all(promises).then(fn, fn);
  }

  async exit(): Promise<void> {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.exit());
    }

    await Promise.all(promises);
  }
}

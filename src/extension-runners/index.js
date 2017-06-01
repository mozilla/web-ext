/* @flow */

import type {
  IExtensionRunner,  // eslint-disable-line import/named
} from './base';

export type MultipleTargetsExtensionRunnerParams = {
  runners: Array<IExtensionRunner>,
};

// Export everything exported by the firefox-desktop runner.
export * from './firefox-desktop';

export class MultipleTargetsExtensionRunner {
  extensionRunners: Array<IExtensionRunner>;

  constructor(params: MultipleTargetsExtensionRunnerParams) {
    this.extensionRunners = params.runners;
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

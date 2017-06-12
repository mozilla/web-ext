/* @flow */

import type {
  IExtensionRunner,  // eslint-disable-line import/named
} from './base';

export type MultipleTargetsExtensionRunnerParams = {
  runners: Array<IExtensionRunner>,
};

// Export everything exported by the firefox-desktop runner.
export * from './firefox-desktop';

// This class implements an extension runner which allow the caller to
// manage multiple extension runners at the same time (e.g. by running
// a Firefox Desktop instance alongside to a Firefox for Android instance).
export class MultiExtensionRunner {
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

  registerCleanup(cleanupCallback: Function): void {
    const promises = [];

    // Create a promise for every extension runner managed by this instance,
    // the promise will be resolved when the particular runner calls its
    // registered cleanup callbacks.
    for (const runner of this.extensionRunners) {
      promises.push(new Promise((resolve) => {
        runner.registerCleanup(resolve);
      }));
    }

    // Wait for all the created promises to be resolved or rejected
    // (once each one of the runners has cleaned up) and then call
    // the cleanup callback registered to this runner.
    Promise.all(promises).then(cleanupCallback, cleanupCallback);
  }

  async exit(): Promise<void> {
    const promises = [];
    for (const runner of this.extensionRunners) {
      promises.push(runner.exit());
    }

    await Promise.all(promises);
  }
}

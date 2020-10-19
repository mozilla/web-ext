// flow-typed signatures for 'chrome-launcher' module.

declare module "chrome-launcher" {
  declare type LaunchOptions = {
    enableExtensions: boolean,
    chromePath: ?string,
    chromeFlags: Array<string>,
    startingUrl: ?string,
    userDataDir: ?string,
    ignoreDefaultFlags: boolean,
  };

  declare class Launcher {
    static defaultFlags: () => Array<string>,
    process: child_process$ChildProcess,
    kill(): Promise<void>,
  }

  declare module.exports: {
    Launcher: Class<Launcher>,
    launch(options?: LaunchOptions): Promise<Launcher>,
  }
}

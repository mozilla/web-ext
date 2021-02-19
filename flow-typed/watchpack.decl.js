// flow-typed signatures for 'watchpack' module.

declare module "watchpack" {
  declare type WatchpackOptions = {
    ignored: Array<string>,
  };

  declare type WatchOptions = {
    files: Array<string>,
    directories: Array<string>,
    missing: Array<string>,
    startTime?: number
  };

  declare class Watchpack extends events$EventEmitter {
    constructor(options?: WatchpackOptions): Watchpack,
    close(): void,
    watch(options: WatchOptions): void,
  }

  declare module.exports: Class<Watchpack>;
}

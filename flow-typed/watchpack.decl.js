// flow-typed signatures for 'watchpack' module.

declare module "watchpack" {
  declare type WatchpackOptions = {
    ignored: Array<string>,
  };

  declare class Watchpack extends events$EventEmitter {
    constructor(options?: WatchpackOptions): Watchpack,
    close(): void,
    watch(files: Array<string>, directories: Array<string>, startTime: number): void,
  }

  declare module.exports: Class<Watchpack>;
}

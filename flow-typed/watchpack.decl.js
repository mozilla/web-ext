// flow-typed signatures for 'watchpack' module.

declare module "watchpack" {
  declare class Watchpack extends event$EventEmitter {
    close(): void,
  }

  declare module.exports: Class<Watchpack>;
}

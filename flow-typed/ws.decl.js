// flow-typed signatures for 'ws' module.

declare module "ws" {
  declare type ServerOptions = {
    host: string,
    port: number,
  }

  declare class WebSocket extends events$EventEmitter {
    constructor(url: string): WebSocket,
    removeEventListener(eventName: string, cb: Function): void,
    readyState: "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED",
    send(msg: string): void,
    close(): void,
      
    static OPEN: "OPEN",
    static CLOSED: "CLOSED",
    static CONNECTING: "CONNECTING",
    static CLOSING: "CLOSING",
    static Server: Class<Server>,
  }

  declare class Server extends net$Server {
    constructor(opts?: ServerOptions, listenCb: Function): Server,
    address(): net$Socket$address,
    clients: Set<WebSocket>,
    close(closedCb: Function): Server,
  }

  declare module.exports: Class<WebSocket>;
}

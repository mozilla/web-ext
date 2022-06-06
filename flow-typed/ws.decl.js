// flow-typed signatures for 'ws' module.

declare module "ws" {
  declare type ServerOptions = {
    host: string,
    port: number,
  }

  declare export class WebSocket extends events$EventEmitter {
    constructor(url: string): WebSocket,
    removeEventListener(eventName: string, cb: Function): void,
    readyState: "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED",
    send(msg: string): void,
    close(code?: number, reason?: string | Buffer): void,
    terminate(): void,
      
    static OPEN: "OPEN",
    static CLOSED: "CLOSED",
    static CONNECTING: "CONNECTING",
    static CLOSING: "CLOSING",
  }

  declare export class WebSocketServer extends net$Server {
    constructor(opts?: ServerOptions, listenCb: Function): WebSocketServer,
    address(): net$Socket$address,
    clients: Set<WebSocket>,
    close(closedCb: Function): WebSocketServer,
  }

  declare export default typeof WebSocket;
}

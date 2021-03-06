/* @flow */
import net from 'net';
import EventEmitter from 'events';
import domain from 'domain';

export type RDPRequest = {
  to: string,
  type: string,
}

export type RDPResult = {
  from: string,
  type: string,
}

export type Deferred = {|
  resolve: Function,
  reject: Function,
|}

type ParseResult = {|
  data: Buffer,
  rdpMessage?: Object,
  error?: Error,
  fatal?: boolean,
|}

export const DEFAULT_PORT = 6000;
export const DEFAULT_HOST = '127.0.0.1';

const UNSOLICITED_EVENTS = new Set([
  'tabNavigated',
  'styleApplied',
  'propertyChange',
  'networkEventUpdate',
  'networkEvent',
  'propertyChange',
  'newMutations',
  'frameUpdate',
  'tabListChanged',
]);

// Parse RDP packets: BYTE_LENGTH + ':' + DATA.
export function parseRDPMessage(data: Buffer): ParseResult {
  const str = data.toString();
  const sepIdx = str.indexOf(':');
  if (sepIdx < 1) {
    return {data};
  }

  const byteLen = parseInt(str.slice(0, sepIdx));
  if (isNaN(byteLen)) {
    const error = new Error('Error parsing RDP message length');
    return {data, error, fatal: true};
  }

  if (data.length - (sepIdx + 1) < byteLen) {
    // Can't parse yet, will retry once more data has been received.
    return {data};
  }

  data = data.slice(sepIdx + 1);
  const msg = data.slice(0, byteLen);
  data = data.slice(byteLen);

  try {
    return {data, rdpMessage: JSON.parse(msg.toString())};
  } catch (error) {
    return {data, error, fatal: false};
  }
}

export function connectToFirefox(port: number): Promise<FirefoxRDPClient> {
  const client = new FirefoxRDPClient();
  return client.connect(port).then(() => client);
}

export default class FirefoxRDPClient extends EventEmitter {
  _incoming: Buffer;
  _pending: Array<{| request: RDPRequest, deferred: Deferred |}>;
  _active: Map<string, Deferred>;
  _rdpConnection: net.Socket;
  _onData: Function;
  _onError: Function;
  _onEnd: Function;
  _onTimeout: Function;

  constructor() {
    super();
    this._incoming = Buffer.alloc(0);
    this._pending = [];
    this._active = new Map();

    this._onData = this.onData.bind(this);
    this._onError = this.onError.bind(this);
    this._onEnd = this.onEnd.bind(this);
    this._onTimeout = this.onTimeout.bind(this);
  }

  connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create a domain to wrap the errors that may be triggered
      // by creating the client connection (e.g. ECONNREFUSED)
      // so that we can reject the promise returned instead of
      // exiting the entire process.
      const d = domain.create();
      d.once('error', reject);
      d.run(() => {
        const conn = net.createConnection({
          port,
          host: DEFAULT_HOST,
        });

        this._rdpConnection = conn;
        conn.on('data', this._onData);
        conn.on('error', this._onError);
        conn.on('end', this._onEnd);
        conn.on('timeout', this._onTimeout);

        // Resolve once the expected initial root message
        // has been received.
        this._expectReply('root', {resolve, reject});
      });
    });
  }

  disconnect(): void {
    if (!this._rdpConnection) {
      return;
    }

    const conn = this._rdpConnection;
    conn.off('data', this._onData);
    conn.off('error', this._onError);
    conn.off('end', this._onEnd);
    conn.off('timeout', this._onTimeout);
    conn.end();

    this._rejectAllRequests(new Error('RDP connection closed'));
  }

  _rejectAllRequests(error: Error) {
    for (const activeDeferred of this._active.values()) {
      activeDeferred.reject(error);
    }
    this._active.clear();

    for (const {deferred} of this._pending) {
      deferred.reject(error);
    }
    this._pending = [];
  }

  async request(requestProps: string | RDPRequest): Promise<RDPResult> {
    let request: RDPRequest;

    if (typeof requestProps === 'string') {
      request = {to: 'root', type: requestProps};
    } else {
      request = requestProps;
    }

    if (request.to == null) {
      throw new Error(
        `Unexpected RDP request without target actor: ${request.type}`
      );
    }

    return new Promise((resolve, reject) => {
      const deferred = {resolve, reject};
      this._pending.push({request, deferred});
      this._flushPendingRequests();
    });
  }

  _flushPendingRequests(): void {
    this._pending = this._pending.filter(({request, deferred}) => {
      if (this._active.has(request.to)) {
        // Keep in the pending requests until there are no requests
        // active on the target RDP actor.
        return true;
      }

      const conn = this._rdpConnection;
      if (!conn) {
        throw new Error('RDP connection closed');
      }

      try {
        let str = JSON.stringify(request);
        str = `${Buffer.from(str).length}:${str}`;
        conn.write(str);
        this._expectReply(request.to, deferred);
      } catch (err) {
        deferred.reject(err);
      }

      // Remove the pending request from the queue.
      return false;
    });
  }

  _expectReply(targetActor: string, deferred: Deferred): void {
    if (this._active.has(targetActor)) {
      throw new Error(`${targetActor} does already have an active request`);
    }

    this._active.set(targetActor, deferred);
  }

  _handleMessage(rdpData: Object): void {
    if (rdpData.from == null) {
      if (rdpData.error) {
        this.emit('rdp-error', rdpData);
        return;
      }

      this.emit('error', new Error(
        `Received an RDP message without a sender actor: ${
          JSON.stringify(rdpData)
        }`
      ));
      return;
    }

    if (UNSOLICITED_EVENTS.has(rdpData.type)) {
      this.emit('unsolicited-event', rdpData);
      return;
    }

    if (this._active.has(rdpData.from)) {
      const deferred = this._active.get(rdpData.from);
      this._active.delete(rdpData.from);
      if (rdpData.error) {
        deferred?.reject(rdpData);
      } else {
        deferred?.resolve(rdpData);
      }
      this._flushPendingRequests();
      return;
    }

    this.emit('error', new Error(
      `Unexpected RDP message received: ${JSON.stringify(rdpData)}`
    ));
  }

  _readMessage(): boolean {
    const {
      data, rdpMessage, error, fatal,
    } = parseRDPMessage(this._incoming);

    this._incoming = data;

    if (error) {
      this.emit(
        'error',
        new Error(`Error parsing RDP packet: ${String(error)}`)
      );
      // Disconnect automatically on a fatal error.
      if (fatal) {
        this.disconnect();
      }
      // Caller can parse the next message if the error wasn't fatal
      // (e.g. the RDP packet that couldn't be parsed has been already
      // removed from the incoming data buffer).
      return !fatal;
    }

    if (!rdpMessage) {
      // Caller will need to wait more data to parse the next message.
      return false;
    }

    this._handleMessage(rdpMessage);
    // Caller can try to parse the next message from the remining data.
    return true;
  }

  onData(data: Buffer) {
    this._incoming = Buffer.concat([this._incoming, data]);
    while (this._readMessage()) {
      // Keep parsing and handling messages until readMessage
      // returns false.
    }
  }

  onError(error: Error) {
    this.emit('error', error);
  }

  onEnd() {
    this.emit('end');
  }

  onTimeout() {
    this.emit('timeout');
  }
}

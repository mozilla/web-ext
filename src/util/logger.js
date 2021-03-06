/* @flow */
import bunyan, {nameFromLevel, createLogger as defaultLogCreator}
  from 'bunyan';


// Bunyan-related Flow types

export type TRACE = 10;
export type DEBUG = 20;
export type INFO = 30;
export type WARN = 40;
export type ERROR = 50;
export type FATAL = 60;

export type BunyanLogLevel =
  TRACE | DEBUG | INFO | WARN | ERROR | FATAL;

export type BunyanLogEntry = {|
  name: string,
  msg: string,
  level: BunyanLogLevel,
|};

export type Logger = {
  debug: (msg: string, ...args: any) => void,
  error: (msg: string, ...args: any) => void,
  info: (msg: string, ...args: any) => void,
  warn: (msg: string, ...args: any) => void,
};


// ConsoleStream types and implementation.

export type ConsoleStreamParams = {|
  verbose?: boolean,
|};

export type ConsoleOptions = {|
  localProcess?: typeof process,
|};

export class ConsoleStream {
  verbose: boolean;
  isCapturing: boolean;
  capturedMessages: Array<string>;

  constructor({verbose = false}: ConsoleStreamParams = {}) {
    this.verbose = verbose;
    this.isCapturing = false;
    this.capturedMessages = [];
  }

  format({name, msg, level}: BunyanLogEntry): string {
    const prefix = this.verbose ? `[${name}][${nameFromLevel[level]}] ` : '';
    return `${prefix}${msg}\n`;
  }

  makeVerbose() {
    this.verbose = true;
  }

  write(
    packet: BunyanLogEntry,
    {localProcess = process}: ConsoleOptions = {}
  ): void {
    const thisLevel: BunyanLogLevel = this.verbose ? bunyan.TRACE : bunyan.INFO;
    if (packet.level >= thisLevel) {
      const msg = this.format(packet);
      if (this.isCapturing) {
        this.capturedMessages.push(msg);
      } else {
        localProcess.stdout.write(msg);
      }
    }
  }

  startCapturing() {
    this.isCapturing = true;
  }

  stopCapturing() {
    this.isCapturing = false;
    this.capturedMessages = [];
  }

  flushCapturedLogs({localProcess = process}: ConsoleOptions = {}) {
    for (const msg of this.capturedMessages) {
      localProcess.stdout.write(msg);
    }
    this.capturedMessages = [];
  }
}

export const consoleStream: ConsoleStream = new ConsoleStream();


// createLogger types and implementation.

export type BunyanStreamConfig = {|
  type: string,
  stream: ConsoleStream,
|};

export type CreateBunyanLogParams = {|
  name: string,
  level: BunyanLogLevel,
  streams: Array<BunyanStreamConfig>,
|};

export type CreateBunyanLogFn = (params: CreateBunyanLogParams) => Logger;

export type CreateLoggerOptions = {|
  createBunyanLog: CreateBunyanLogFn,
|};

export function createLogger(
  filename: string,
  {createBunyanLog = defaultLogCreator}: CreateLoggerOptions = {}
): Logger {
  return createBunyanLog({
    // Strip the leading src/ from file names (which is in all file names) to
    // make the name less redundant.
    name: filename.replace(/^src\//, ''),
    // Capture all log levels and let the stream filter them.
    level: bunyan.TRACE,
    streams: [{
      type: 'raw',
      stream: consoleStream,
    }],
  });
}

/* @flow */
import bunyan, {nameFromLevel, createLogger as defaultLogCreator}
  from 'bunyan';


export class ConsoleStream {
  verbose: boolean;
  isCapturing: boolean;
  capturedMessages: Array<string>;

  constructor({verbose=false}: Object = {}) {
    this.verbose = verbose;
    this.isCapturing = false;
    this.capturedMessages = [];
  }

  format({name, msg, level}: Object): string {
    const prefix = this.verbose ? `[${name}][${nameFromLevel[level]}] ` : '';
    return `${prefix}${msg}\n`;
  }

  makeVerbose() {
    this.verbose = true;
  }

  write(packet: Object, {localProcess=process}: Object = {}) {
    const thisLevel = this.verbose ? bunyan.TRACE : bunyan.INFO;
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

  flushCapturedLogs({localProcess=process}: Object = {}) {
    for (let msg of this.capturedMessages) {
      localProcess.stdout.write(msg);
    }
    this.capturedMessages = [];
  }
}

export const consoleStream = new ConsoleStream();


export function createLogger(
    filename: string,
    {createBunyanLog=defaultLogCreator}: Object = {}): Object {

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

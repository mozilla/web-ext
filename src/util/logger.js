import { fileURLToPath } from 'url';

import bunyan, {
  nameFromLevel,
  createLogger as defaultLogCreator,
} from 'bunyan';


export class ConsoleStream {
  verbose;
  isCapturing;
  capturedMessages;

  constructor({ verbose = false } = {}) {
    this.verbose = verbose;
    this.isCapturing = false;
    this.capturedMessages = [];
  }

  format({ name, msg, level }) {
    const prefix = this.verbose ? `[${name}][${nameFromLevel[level]}] ` : '';
    return `${prefix}${msg}\n`;
  }

  makeVerbose() {
    this.verbose = true;
  }

  write(packet, { localProcess = process } = {}) {
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

  flushCapturedLogs({ localProcess = process } = {}) {
    for (const msg of this.capturedMessages) {
      localProcess.stdout.write(msg);
    }
    this.capturedMessages = [];
  }
}

export const consoleStream = new ConsoleStream();

// createLogger types and implementation.

export function createLogger(
  moduleURL,
  { createBunyanLog = defaultLogCreator } = {}
) {
  return createBunyanLog({
    // Strip the leading src/ from file names (which is in all file names) to
    // make the name less redundant.
    name: moduleURL
      ? fileURLToPath(moduleURL).replace(/^src\//, '')
      : 'unknown-module',
    // Capture all log levels and let the stream filter them.
    level: bunyan.TRACE,
    streams: [
      {
        type: 'raw',
        stream: consoleStream,
      },
    ],
  });
}

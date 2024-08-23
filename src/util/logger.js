import { fileURLToPath } from 'url';

import pino, { levels as logLevels } from 'pino';

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
    const prefix = this.verbose ? `[${name}][${logLevels.labels[level]}] ` : '';
    return `${prefix}${msg}\n`;
  }

  makeVerbose() {
    this.verbose = true;
  }

  write(jsonString, { localProcess = process } = {}) {
    const packet = JSON.parse(jsonString);
    const thisLevel = this.verbose
      ? logLevels.values.trace
      : logLevels.values.info;
    if (packet.level >= thisLevel) {
      const msg = this.format(packet);
      if (this.isCapturing) {
        this.capturedMessages.push(msg);
      } else if (packet.level > logLevels.values.info) {
        localProcess.stderr.write(msg);
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

export function createLogger(moduleURL, { createPinoLog = pino } = {}) {
  return createPinoLog(
    {
      // Strip the leading src/ from file names (which is in all file names) to
      // make the name less redundant.
      name: moduleURL
        ? fileURLToPath(moduleURL).replace(/^src\//, '')
        : 'unknown-module',
      // Capture all log levels and let the stream filter them.
      level: logLevels.values.trace,
    },
    consoleStream,
  );
}

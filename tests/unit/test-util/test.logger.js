import { Writable } from 'stream';
import { pathToFileURL } from 'url';

import { levels as logLevels } from 'pino';
import * as sinon from 'sinon';
import { it, describe } from 'mocha';
import { assert } from 'chai';

import { createLogger, ConsoleStream } from '../../../src/util/logger.js';

describe('logger', () => {
  describe('createLogger', () => {
    it('makes file names less redundant', () => {
      const createPinoLog = sinon.spy(() => {});
      const expectedName =
        process.platform === 'win32'
          ? 'C:\\src\\some-file.js'
          : '/src/some-file.js';
      createLogger(pathToFileURL(expectedName).href, { createPinoLog });
      sinon.assert.calledWithMatch(createPinoLog, { name: expectedName });
    });
  });

  describe('ConsoleStream', () => {
    function packet(overrides) {
      return JSON.stringify({
        name: 'some name',
        msg: 'some messge',
        level: logLevels.values.info,
        ...overrides,
      });
    }

    function fakeProcess() {
      class FakeWritableStream extends Writable {
        write = () => true;
      }
      const fakeWritableStream = new FakeWritableStream();
      sinon.spy(fakeWritableStream, 'write');

      return {
        stdout: fakeWritableStream,
      };
    }

    it('lets you turn on verbose logging', () => {
      const log = new ConsoleStream({ verbose: false });
      log.makeVerbose();
      assert.equal(log.verbose, true);
    });

    it('logs names in verbose mode', () => {
      const log = new ConsoleStream({ verbose: true });
      assert.equal(
        log.format({
          name: 'foo',
          msg: 'some message',
          level: logLevels.values.debug,
        }),
        '[foo][debug] some message\n',
      );
    });

    it('does not log names in non-verbose mode', () => {
      const log = new ConsoleStream({ verbose: false });
      assert.equal(
        log.format({ name: 'foo', msg: 'some message' }),
        'some message\n',
      );
    });

    it('does not log debug packets unless verbose', () => {
      const log = new ConsoleStream({ verbose: false });
      const localProcess = fakeProcess();
      log.write(packet({ level: logLevels.values.debug }), { localProcess });
      sinon.assert.notCalled(localProcess.stdout.write);
    });

    it('does not log trace packets unless verbose', () => {
      const log = new ConsoleStream({ verbose: false });
      const localProcess = fakeProcess();
      log.write(packet({ level: logLevels.values.trace }), { localProcess });
      sinon.assert.notCalled(localProcess.stdout.write);
    });

    it('logs debug packets when verbose', () => {
      const log = new ConsoleStream({ verbose: true });
      const localProcess = fakeProcess();
      log.write(packet({ level: logLevels.values.debug }), { localProcess });
      sinon.assert.called(localProcess.stdout.write);
    });

    it('logs trace packets when verbose', () => {
      const log = new ConsoleStream({ verbose: true });
      const localProcess = fakeProcess();
      log.write(packet({ level: logLevels.values.trace }), { localProcess });
      sinon.assert.called(localProcess.stdout.write);
    });

    it('logs info packets when verbose or not', () => {
      const log = new ConsoleStream({ verbose: false });
      const localProcess = fakeProcess();
      log.write(packet({ level: logLevels.values.info }), { localProcess });
      log.makeVerbose();
      log.write(packet({ level: logLevels.values.info }), { localProcess });
      sinon.assert.callCount(localProcess.stdout.write, 2);
    });

    it('lets you capture logging', () => {
      const log = new ConsoleStream();
      const localProcess = fakeProcess();

      log.startCapturing();
      log.write(packet({ msg: 'message' }), { localProcess });
      sinon.assert.notCalled(localProcess.stdout.write);
      log.flushCapturedLogs({ localProcess });
      sinon.assert.calledWith(localProcess.stdout.write, 'message\n');
    });

    it('only flushes captured messages once', () => {
      const log = new ConsoleStream();
      let localProcess = fakeProcess();

      log.startCapturing();
      log.write(packet(), { localProcess });
      log.flushCapturedLogs({ localProcess });

      // Make sure there is nothing more to flush.
      localProcess = fakeProcess();
      log.flushCapturedLogs({ localProcess });
      sinon.assert.notCalled(localProcess.stdout.write);
    });

    it('lets you start and stop capturing', () => {
      const log = new ConsoleStream();
      let localProcess = fakeProcess();

      log.startCapturing();
      log.write(packet(), { localProcess });
      sinon.assert.notCalled(localProcess.stdout.write);

      log.stopCapturing();
      log.write(packet(), { localProcess });
      sinon.assert.callCount(localProcess.stdout.write, 1);

      // Make sure that when we start capturing again,
      // the queue gets reset.
      log.startCapturing();
      log.write(packet());
      localProcess = fakeProcess();
      log.flushCapturedLogs({ localProcess });
      sinon.assert.callCount(localProcess.stdout.write, 1);
    });
  });
});

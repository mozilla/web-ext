/* @flow */
import {WriteStream} from 'tty';

import bunyan from 'bunyan';
import sinon from 'sinon';
import {it, describe} from 'mocha';
import {assert} from 'chai';

import {createLogger, ConsoleStream} from '../../../src/util/logger';


describe('logger', () => {

  describe('createLogger', () => {

    it('makes file names less redundant', () => {
      const createBunyanLog = sinon.spy(() => {});
      createLogger('src/some-file.js', {createBunyanLog});
      assert.equal(createBunyanLog.firstCall.args[0].name, 'some-file.js');
    });

  });

  describe('ConsoleStream', () => {

    function packet(overrides) {
      return {
        name: 'some name',
        msg: 'some messge',
        level: bunyan.INFO,
        ...overrides,
      };
    }

    // NOTE: create a fake process that makes flow happy.
    function fakeProcess() {
      class FakeWritableStream extends WriteStream {
        write(): boolean {
          return true;
        }
      }

      const fakeWritableStream = new FakeWritableStream();
      sinon.spy(fakeWritableStream, 'write');

      return {
        stdout: fakeWritableStream,
      };
    }

    it('lets you turn on verbose logging', () => {
      const log = new ConsoleStream({verbose: false});
      log.makeVerbose();
      assert.equal(log.verbose, true);
    });

    it('logs names in verbose mode', () => {
      const log = new ConsoleStream({verbose: true});
      assert.equal(
        log.format(packet({
          name: 'foo',
          msg: 'some message',
          level: bunyan.DEBUG,
        })),
        '[foo][debug] some message\n');
    });

    it('does not log names in non-verbose mode', () => {
      const log = new ConsoleStream({verbose: false});
      assert.equal(
        log.format(packet({name: 'foo', msg: 'some message'})),
        'some message\n');
    });

    it('does not log debug packets unless verbose', () => {
      const log = new ConsoleStream({verbose: false});
      const localProcess = fakeProcess();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet({level: bunyan.DEBUG}), {localProcess});
      assert.equal(localProcess.stdout.write.called, false);
    });

    it('does not log trace packets unless verbose', () => {
      const log = new ConsoleStream({verbose: false});
      const localProcess = fakeProcess();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet({level: bunyan.TRACE}), {localProcess});
      assert.equal(localProcess.stdout.write.called, false);
    });

    it('logs debug packets when verbose', () => {
      const log = new ConsoleStream({verbose: true});
      const localProcess = fakeProcess();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet({level: bunyan.DEBUG}), {localProcess});
      assert.equal(localProcess.stdout.write.called, true);
    });

    it('logs trace packets when verbose', () => {
      const log = new ConsoleStream({verbose: true});
      const localProcess = fakeProcess();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet({level: bunyan.TRACE}), {localProcess});
      assert.equal(localProcess.stdout.write.called, true);
    });

    it('logs info packets when verbose or not', () => {
      const log = new ConsoleStream({verbose: false});
      const localProcess = fakeProcess();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet({level: bunyan.INFO}), {localProcess});
      log.makeVerbose();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet({level: bunyan.INFO}), {localProcess});
      assert.equal(localProcess.stdout.write.callCount, 2);
    });

    it('lets you capture logging', () => {
      const log = new ConsoleStream();
      const localProcess = fakeProcess();

      log.startCapturing();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet({msg: 'message'}), {localProcess});
      assert.equal(localProcess.stdout.write.called, false);
      // $FLOW_IGNORE: fake process for testing reasons.
      log.flushCapturedLogs({localProcess});
      assert.equal(localProcess.stdout.write.called, true);
      assert.equal(localProcess.stdout.write.firstCall.args[0],
                   'message\n');
    });

    it('only flushes captured messages once', () => {
      const log = new ConsoleStream();
      let localProcess = fakeProcess();

      log.startCapturing();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet(), {localProcess});
      // $FLOW_IGNORE: fake process for testing reasons.
      log.flushCapturedLogs({localProcess});

      // Make sure there is nothing more to flush.
      localProcess = fakeProcess();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.flushCapturedLogs({localProcess});
      assert.equal(localProcess.stdout.write.callCount, 0);
    });

    it('lets you start and stop capturing', () => {
      const log = new ConsoleStream();
      let localProcess = fakeProcess();

      log.startCapturing();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet(), {localProcess});
      assert.equal(localProcess.stdout.write.callCount, 0);

      log.stopCapturing();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.write(packet(), {localProcess});
      assert.equal(localProcess.stdout.write.callCount, 1);

      // Make sure that when we start capturing again,
      // the queue gets reset.
      log.startCapturing();
      log.write(packet());
      localProcess = fakeProcess();
      // $FLOW_IGNORE: fake process for testing reasons.
      log.flushCapturedLogs({localProcess});
      assert.equal(localProcess.stdout.write.callCount, 1);
    });

  });

});

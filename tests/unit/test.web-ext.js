/* @flow */
import {afterEach, describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import webExt from '../../src/main';
import {main} from '../../src/program';
import {consoleStream} from '../../src/util/logger';
import {listADBDevices, listADBFirefoxAPKs} from '../../src/util/adb';


describe('webExt', () => {
  it('exposes main', () => {
    assert.equal(webExt.main, main);
  });

  it('gives you access to the log stream', () => {
    assert.equal(webExt.util.logger.consoleStream, consoleStream);
  });

  describe('exposes adb utils', () => {
    it('gives access to listADBDevices', () => {
      assert.equal(webExt.util.adb.listADBDevices, listADBDevices);
    });

    it('gives access to listADBFirefoxAPKs', () => {
      assert.equal(webExt.util.adb.listADBFirefoxAPKs, listADBFirefoxAPKs);
    });
  });

  describe('exposes commands', () => {
    let stub: any;
    afterEach(() => {
      stub.restore();
      stub = undefined;
    });
    for (const cmd of ['run', 'lint', 'build', 'sign', 'docs']) {
      it(`lazily loads cmd/${cmd}`, async () => {
        // TODO: use async import instead of require - https://github.com/mozilla/web-ext/issues/1306
        // $FlowIgnore: non-literal require used only in tests.
        const cmdModule = require(`../../src/cmd/${cmd}`);
        stub = sinon.stub(cmdModule, 'default');

        const params = {};
        const options = {};
        const expectedResult = {};
        stub.returns(expectedResult);

        const runCommand: Function = webExt.cmd[cmd];
        const result = await runCommand(params, options);

        // Check whether parameters and return values are forwarded as-is.
        sinon.assert.calledOnce(stub);
        sinon.assert.calledWithExactly(stub, params, options);
        assert.equal(expectedResult, result);
      });
    }
  });
});

import { afterEach, describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { mockModule, resetMockModules } from './helpers.js';
import webExt from '../../src/main.js';
import { main } from '../../src/program.js';

describe('webExt', () => {
  it('exposes main', () => {
    assert.equal(webExt.main, main);
  });

  describe('exposes commands', () => {
    let stub;
    afterEach(() => {
      resetMockModules();
      stub = undefined;
    });
    for (const cmd of ['run', 'lint', 'build', 'sign', 'docs']) {
      it(`lazily loads cmd/${cmd}`, async () => {
        const cmdModule = await import(`../../src/cmd/${cmd}.js`);
        stub = sinon.stub({ default: cmdModule.default }, 'default');

        mockModule({
          moduleURL: `../../src/cmd/${cmd}.js`,
          importerModuleURL: import.meta.url,
          namedExports: {},
          defaultExport: stub,
        });

        const params = {};
        const options = {};
        const expectedResult = {};
        stub?.returns(expectedResult);

        const { default: webExtModule } = await import('../../src/main.js');
        const runCommand = webExtModule.cmd[cmd];
        const result = await runCommand(params, options);

        // Check whether parameters and return values are forwarded as-is.
        sinon.assert.calledOnce(stub);
        sinon.assert.calledWithExactly(stub, params, options);
        assert.equal(expectedResult, result);
      });
    }
  });
});

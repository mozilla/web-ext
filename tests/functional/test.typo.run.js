import { describe, it } from 'mocha';
import { assert } from 'chai';

import { execWebExt } from './common.js';

describe('web-ext', () => {
  it('recommends matching command', async () => {
    const argv = ['buld'];

    return execWebExt(argv, {}).waitForExit.then(({ exitCode, stderr }) => {
      assert.notEqual(exitCode, 0);
      assert.match(stderr, /Did you mean build/);
    });
  });
});

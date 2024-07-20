import { assert } from 'chai';
import { describe, it } from 'mocha';

import expandPrefs from '../../../src/util/expand-prefs.js';

describe('utils/expand-prefs', () => {
  it('should expand dot-deliminated preferences into a deep object', () => {
    const input = {
      a: 'a',
      'b.c': 'c',
    };
    const expected = {
      a: 'a',
      b: {
        c: 'c',
      },
    };
    const actual = expandPrefs(input);

    assert.deepEqual(actual, expected);
  });

  it('should not pollute the object prototype', () => {
    const call = 'overriden';
    const input = {
      'hasOwnProperty.call': call,
    };
    const expected = {
      hasOwnProperty: {
        call,
      },
    };
    const actual = expandPrefs(input);

    assert.notEqual(Object.prototype.hasOwnProperty.call, call);
    assert.deepEqual(actual, expected);
  });
});

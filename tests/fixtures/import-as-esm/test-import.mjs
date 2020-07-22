import assert from 'assert';

// eslint-disable-next-line import/no-unresolved
import webExt from 'web-ext';

assert.deepEqual(Object.keys(webExt).sort(), ['cmd', 'main', 'util'].sort());
assert.equal(typeof webExt.cmd.run, 'function');

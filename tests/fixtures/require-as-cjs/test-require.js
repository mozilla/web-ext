const assert = require('assert');

const webExt = require('web-ext');

assert.deepEqual(Object.keys(webExt).sort(), ['cmd', 'main', 'util'].sort());
assert.equal(typeof webExt.cmd.run, 'function');

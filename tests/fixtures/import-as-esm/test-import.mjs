import assert from 'assert';

// eslint-disable-next-line import/no-unresolved
import webExt from 'web-ext';

assert.deepEqual(Object.keys(webExt).sort(), ['cmd', 'main', 'util'].sort());
assert.deepEqual(Object.keys(webExt.util).sort(), ['logger', 'adb'].sort());
assert.deepEqual(
  Object.keys(webExt.util.adb).sort(),
  ['listADBDevices', 'listADBFirefoxAPKs'].sort(),
);
assert.equal(typeof webExt.cmd.run, 'function');

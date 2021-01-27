const assert = require('assert');
const path = require('path');

function testModuleExports(webExt) {
  assert.deepEqual(Object.keys(webExt).sort(), ['cmd', 'main', 'util'].sort());
  assert.deepEqual(Object.keys(webExt.util).sort(), ['logger', 'adb'].sort());
  assert.equal(typeof webExt.cmd.run, 'function');

  assertImportedADB({expectLoaded: false});
  assert.deepEqual(
    Object.keys(webExt.util.adb).sort(),
    ['listADBDevices', 'listADBFirefoxAPKs'].sort(),
  );
  assertImportedADB({expectLoaded: true});
}

function assertImportedADB({expectLoaded}) {
  const adbPathString = path.join('@devicefarmer', 'adbkit');
  const hasAdbDeps = Object.keys(require.cache).filter(
    (filePath) => filePath.includes(adbPathString)
  ).length > 0;

  const msg = expectLoaded
    ? 'adb module should have been loaded'
    : 'adb module should not be loaded yet';

  assert.equal(hasAdbDeps, expectLoaded, msg);
}

module.exports = {
  testModuleExports,
};

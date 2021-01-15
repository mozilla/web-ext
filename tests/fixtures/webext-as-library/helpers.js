const assert = require('assert');

export function testWebExtModuleImports(webExt) {
  assert.deepEqual(Object.keys(webExt).sort(), ['cmd', 'main', 'util'].sort());
  assert.deepEqual(Object.keys(webExt.util).sort(), ['logger', 'adb'].sort());
  assert.deepEqual(
    Object.keys(webExt.util.adb).sort(),
    ['listADBDevices', 'listADBFirefoxAPKs'].sort(),
  );
  assert.equal(typeof webExt.cmd.run, 'function');
}

module.exports = {
  testWebExtModuleImports,
};

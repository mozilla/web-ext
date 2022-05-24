const assert = require('assert');
const path = require('path');

async function testModuleExports(webExt) {
  assert.deepEqual(Object.keys(webExt).sort(), ['cmd', 'main'].sort());
  assert.equal(typeof webExt.cmd.run, 'function');

}

async function testModuleExportedUtils() {
  assertImportedADB({expectLoaded: false});
  const utilADB = await import('web-ext/util/adb'); // eslint-disable-line import/no-unresolved
  assert.equal(typeof utilADB.listADBDevices, 'function');
  assert.equal(typeof utilADB.listADBFirefoxAPKs, 'function');
  assertImportedADB({expectLoaded: true});

  const utilLogger = await import('web-ext/util/logger'); // eslint-disable-line import/no-unresolved
  assert.equal(typeof utilLogger.createLogger, 'function');
  assert.equal(typeof utilLogger.ConsoleStream?.constructor, 'function');
  assert.ok(utilLogger.consoleStream instanceof utilLogger.ConsoleStream);
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
  testModuleExportedUtils,
};

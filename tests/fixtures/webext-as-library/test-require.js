const assert = require('assert');

const {testModuleExports, testModuleExportedUtils} = require('./helpers.js');


(async () => {
  // Trying to require web-ext as a CommonJS module is not supported anymore
  // and it should be throwing the expected ERR_REQUIRE_ESM error.
  assert.throws(
    () => require('web-ext'),
    {
      name: 'Error',
      code: 'ERR_REQUIRE_ESM',
    }
  );

  // But it should still be possible to import it in a CommonJS module
  // using a dynamic import.
  const {cmd, main} = await import('web-ext'); // eslint-disable-line import/no-unresolved

  await testModuleExports({cmd, main});
  await testModuleExportedUtils();
})();

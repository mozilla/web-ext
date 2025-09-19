const {testModuleExports, testModuleExportedUtils} = require('./helpers.js');


(async () => {
  // Prior to Node v20.19, it was not possible to load web-ext with `require()`
  // but that changed in Node v20.19 according to
  // https://nodejs.org/en/blog/release/v20.19.0#requireesm-is-now-enabled-by-default.
  //
  // We are not going to verify that. Instead, we only verify that we can
  // import web-ext using a dynamic import in a CommonJS module.
  const {cmd, main} = await import('web-ext'); // eslint-disable-line import/no-unresolved

  await testModuleExports({cmd, main});
  await testModuleExportedUtils();
})();

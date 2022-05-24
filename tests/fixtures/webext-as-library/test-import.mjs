// eslint-disable-next-line import/no-unresolved
import webExt from 'web-ext';

// eslint-disable-next-line import/extensions
import helpers from './helpers.js';

const {testModuleExports, testModuleExportedUtils} = helpers;

await testModuleExports(webExt);
await testModuleExportedUtils();

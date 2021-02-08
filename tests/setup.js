/* @flow */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

// Enable chai-as-promised plugin.
chai.use(chaiAsPromised);

// Fake WEBEXT_BUILD_ENV injected as a global during unit tests task (which loads and
// transpiles the web-ext sources on the fly instead of requiring an additional webpack
// bundle for the tests)
global.WEBEXT_BUILD_ENV = 'testing';

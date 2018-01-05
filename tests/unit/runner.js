// Webpack tests entry point. Bundles all the test files
// into a single file.

import 'babel-polyfill';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

// Enable chai-as-promised plugin.
chai.use(chaiAsPromised);

var context = require.context('.', true, /.*?test\..*?.js$/);
context.keys().forEach(context);

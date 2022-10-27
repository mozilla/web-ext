// This file is loaded when developers import 'web-ext' in their own code.

// NOTE: disabled eslint rules:
// - import/no-unresolved: in the CI jobs, the `lib/main.js` file has likely not been built yet. It's fine to
//   disable this rule because we have automated tests (which would catch an unresolved import issue
//   here).
//
// eslint-disable-next-line import/no-unresolved
import webext from './lib/main.js';

export default webext;
export const { cmd, main } = webext;

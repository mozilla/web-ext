#!/usr/bin/env node

import eslint from './lib/eslint.js';
import { mochaUnit } from './lib/mocha.js';
import { isBuilt } from './lib/babel.js';

const COVERAGE =
  process.argv.includes('--coverage') || process.env.COVERAGE === 'y';

if (!isBuilt()) {
  console.error('web-ext transpiled sources missing. Run "npm run build".');
  process.exit(1);
}

console.log('Running eslint...');
if (!eslint()) {
  process.exit(1);
}

console.log('Running mocha unit tests...', COVERAGE ? '(COVERAGE)' : '');
const ok = mochaUnit({}, COVERAGE);
process.exit(ok ? 0 : 1);

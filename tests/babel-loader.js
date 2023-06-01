/**
 * NOTE: This ESM module is being used as a node loader (https://nodejs.org/api/esm.html#esm_experimental_loaders)
 * while running mocha tests, e.g.:
 *
 *     npx mocha -n "loader=./tests/babel-loader.js" -r tests/setup.js tests/unit/test.config.js
 *
 * It is responsible for the transpiling on the fly of the imported tests modules using babel.
 *
 * The simplified transformSource function that follows has been derived from the existing node ESM loader:
 *
 * - https://github.com/giltayar/babel-register-esm
 *
 * COMPATIBILITY NOTES:
 *
 * nodejs module loader API is experimental and so different nodejs versions expects
 * a different set of hooks:
 *
 * - in nodejs < 16: `getSource` and `transformSource`
 * - in nodejs >= 16: `resolve` and `load`
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import babel from '@babel/core';
import * as td from 'testdouble';

const MODULE_TYPES = ['module', 'commonjs'];
const TESTS_BASE_URL = path.dirname(import.meta.url);
const SRC_BASE_URL = pathToFileURL(
  path.resolve(path.join(fileURLToPath(TESTS_BASE_URL), '..', 'src'))
).href;

global.__webextMocks = new Set();

// Re-export testdouble nodeloader (used to mock ESM modules).
export const resolve = td.resolve;
export const getSource = td.getSource;

const isTestModule = (url) => url.startsWith(TESTS_BASE_URL);
const isSrcModule = (url) => url.startsWith(SRC_BASE_URL);
const needsTranspile = (url) => isTestModule(url) || isSrcModule(url);

function hasMock(url) {
  if (!isSrcModule(url)) {
    return false;
  }
  const cleanURL = pathToFileURL(fileURLToPath(url)).href;
  return global.__webextMocks.has(cleanURL);
}

/**
 * @param {string} url
 * @param {{ format: string, url: string }} context
 * @param {Function} [defaultLoad]
 * @returns {Promise<{ source: (string | SharedArrayBuffer | Uint8Array) }>}
 */
export async function load(url, context, defaultLoad) {
  if (hasMock(url) || !needsTranspile(url)) {
    return td.load(url, context, defaultLoad);
  }

  const { source: rawSource } = await defaultLoad(url, { format: 'module' });

  const result = {
    format: 'module',
    ...(await transformSource(rawSource, { url, format: 'module' })),
  };
  return result;
}

/**
 * @param {string | SharedArrayBuffer | Uint8Array} source
 * @param {{ format: string, url: string }} context
 * @param {Function} [defaultTransformSource]
 * @returns {Promise<{ source: (string | SharedArrayBuffer | Uint8Array) }>}
 */
export async function transformSource(source, context, defaultTransformSource) {
  const { url, format } = context;
  if (!MODULE_TYPES.includes(format) || !needsTranspile(url) || hasMock(url)) {
    if (defaultTransformSource) {
      return defaultTransformSource(source, context, defaultTransformSource);
    } else {
      return { source };
    }
  }

  // Transpile tests-related modules on the fly using babel.
  const stringSource =
    typeof source === 'string'
      ? source
      : Buffer.isBuffer(source)
      ? source.toString('utf-8')
      : Buffer.from(source).toString('utf-8');

  let sourceCode = await babel.transformAsync(stringSource, {
    sourceType: 'module',
    filename: fileURLToPath(url),
  });

  sourceCode = sourceCode ? sourceCode.code : undefined;

  if (!sourceCode) {
    throw new Error(
      `tests/babel-loader.js: undefined babel transform result for ${url}`
    );
  }

  return { source: sourceCode };
}

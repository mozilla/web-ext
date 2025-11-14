import { defineConfig, globalIgnores } from 'eslint/config';
import _import from 'eslint-plugin-import';
import { fixupPluginRules } from '@eslint/compat';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores([
    '**/lib/',
    '!scripts/lib',
    '**/coverage/',
    '**/artifacts/',
    '**/commitlint.config.cjs',
    '**/eslint.config.mjs',
  ]),
  {
    extends: compat.extends('eslint:recommended'),

    plugins: {
      import: fixupPluginRules(_import),
    },

    languageOptions: {
      globals: {
        ...globals.node,
        exports: false,
        module: false,
        require: false,
      },

      parser: babelParser,
      ecmaVersion: 6,
      sourceType: 'module',

      parserOptions: {
        ecmaFeatures: {
          arrowFunctions: true,
          blockBindings: true,
          classes: true,
          destructuring: true,
          defaultParams: true,
          modules: true,
          restParams: true,
          spread: true,
        },

        babelConfig: {
          configFile: './.babelrc',
        },

        requireConfigFile: false,
      },
    },

    rules: {
      'arrow-parens': 2,
      'arrow-spacing': 2,
      'block-scoped-var': 0,

      'brace-style': [
        2,
        '1tbs',
        {
          allowSingleLine: false,
        },
      ],

      camelcase: 0,
      'comma-dangle': [2, 'always-multiline'],
      'comma-spacing': 2,
      'comma-style': [2, 'last'],
      curly: [2, 'all'],

      'dot-notation': [
        2,
        {
          allowKeywords: true,
        },
      ],

      eqeqeq: [2, 'allow-null'],
      'guard-for-in': 0,
      'key-spacing': 2,
      'keyword-spacing': 2,

      'new-cap': [
        2,
        {
          capIsNewExceptions: ['Deferred'],
        },
      ],

      'no-bitwise': 2,
      'no-caller': 2,
      'no-cond-assign': [2, 'except-parens'],
      'no-console': 2,
      'no-debugger': 2,
      'no-empty': 2,
      'no-eval': 2,
      'no-extend-native': 2,
      'no-extra-parens': 0,
      'no-extra-semi': 2,

      'no-implicit-coercion': [
        2,
        {
          boolean: true,
          number: true,
          string: true,
        },
      ],

      'no-irregular-whitespace': 2,
      'no-iterator': 2,
      'no-loop-func': 0,
      'no-mixed-spaces-and-tabs': 2,
      'no-multi-str': 2,
      'no-multi-spaces': 2,

      'no-multiple-empty-lines': [
        2,
        {
          max: 2,
        },
      ],

      'no-new': 2,
      'no-plusplus': 0,
      'no-proto': 2,
      'no-redeclare': 0,

      'no-shadow': [
        2,
        {
          builtinGlobals: true,
        },
      ],

      'no-shadow-restricted-names': 2,
      'no-script-url': 2,
      'no-sequences': 2,
      'no-template-curly-in-string': 2,

      'no-trailing-spaces': [
        2,
        {
          skipBlankLines: false,
        },
      ],

      'no-undef': 2,
      'no-underscore-dangle': 0,
      'no-unneeded-ternary': 2,
      'no-unused-vars': 2,
      'no-with': 2,

      'object-property-newline': [
        2,
        {
          allowMultiplePropertiesPerLine: true,
        },
      ],

      'object-shorthand': 2,
      'one-var': [2, 'never'],
      'prefer-const': 2,
      'prefer-template': 2,
      quotes: [2, 'single', 'avoid-escape'],
      'require-yield': 2,
      semi: [2, 'always'],
      'space-before-blocks': [2, 'always'],
      'space-infix-ops': 2,
      strict: [2, 'never'],
      'valid-typeof': 2,
      'wrap-iife': [2, 'inside'],

      // This makes sure imported modules exist.
      'import/no-unresolved': 2,
      // This makes sure imported names exist.
      'import/named': 2,
      // This will catch accidental default imports when no default is defined.
      'import/default': 2,
      // This makes sure `*' imports are dereferenced to real exports.
      'import/namespace': 2,
      // This catches any export mistakes.
      'import/export': 2,
      // This catches default names that conflict with actual exported names.
      // For example, this was probably a typo:
      //   import foo from 'bar';
      // that should be corrected as:
      //   import { foo } from 'bar';
      'import/no-named-as-default': 2,
      // This catches possible typos like trying to access a real export on a
      // default import.
      'import/no-named-as-default-member': 2,
      // This prevents exporting a mutable variable.
      'import/no-mutable-exports': 2,
      // This makes sure package.json defines dev vs. prod dependencies correctly.
      'import/no-extraneous-dependencies': [
        2,
        {
          devDependencies: ['tests/**/*.js', 'scripts/**/*.js'],
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
      // This ensures imports are at the top of the file.
      'import/imports-first': 2,
      // This catches duplicate exports.
      'import/no-duplicates': 2,
      // This ensures import statements never provide a file extension in the path.
      // NOTE: disabled due to https://github.com/import-js/eslint-plugin-import/issues/2104
      'import/extensions': [0, 'never'],
      // This ensures imports are organized by type and that groups are
      // separated by a new line.
      'import/order': [
        2,
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling'],
            'index',
          ],
          'newlines-between': 'always',
        },
      ],

      // This ensures a new line after all import statements.
      'import/newline-after-import': 2,
    },
  },
]);

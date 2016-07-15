/*
 * Flow does not validate any of these imports. This is a workaround for:
 * https://github.com/facebook/flow/issues/1448
 */
import ExtendableError from 'es6-error';
import promisify from 'es6-promisify';
import signAddon from 'sign-addon';
import {createInstance as createLinter} from 'addons-linter';

export {promisify, ExtendableError, signAddon, createLinter};

/*
 * This is a terrible and sad place that will hopefully cease to exist soon.
 *
 * It is a workaround for:
 * https://github.com/facebook/flow/issues/1448
 */
import _ExtendableError from 'es6-error';
import _promisify from 'es6-promisify';

export const ExtendableError = _ExtendableError;
export const promisify = _promisify;

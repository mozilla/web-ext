/*
 * This is a terrible and sad place that will hopefully cease to exist soon.
 *
 * It is a workaround for:
 * https://github.com/facebook/flow/issues/1448
 */
import ExtendableError from 'es6-error';
import promisify from 'es6-promisify';

export {promisify, ExtendableError};

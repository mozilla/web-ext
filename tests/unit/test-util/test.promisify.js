import { promisify } from 'util';

import { describe, it } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import {
  multiArgsPromisedFn,
  promisifyCustom,
} from '../../../src/util/promisify.js';

describe('nodejs util.promisify', () => {
  it('wraps a nodejs callback-based function into a promised function', async () => {
    const expectedParam1 = 'param-value-1';
    const expectedParam2 = 'param-value-2';
    const expectedResult = { result: 'value' };
    const expectedError = new Error('Fake error');

    const fnCallSuccess = sinon.spy(function (param1, param2, cb) {
      setTimeout(() => cb(undefined, expectedResult), 0);
    });

    const fnCallFailure = sinon.spy(function (param, cb) {
      setTimeout(() => cb(expectedError), 0);
    });

    const fnCallThrow = sinon.spy(function fnCallThrow() {
      throw expectedError;
    });

    const promisedFnSuccess = promisify(fnCallSuccess);
    const promisedFnFailure = promisify(fnCallFailure);
    const promisedFnThrow = promisify(fnCallThrow);

    // Test successfull promised function call.
    await assert.becomes(
      promisedFnSuccess(expectedParam1, expectedParam2),
      expectedResult
    );
    sinon.assert.calledOnce(fnCallSuccess);
    sinon.assert.calledWith(
      fnCallSuccess,
      expectedParam1,
      expectedParam2,
      sinon.match.func
    );

    // Test failed promised function call.
    await assert.isRejected(promisedFnFailure(expectedParam1), expectedError);
    sinon.assert.calledOnce(fnCallFailure);
    sinon.assert.calledWith(fnCallFailure, expectedParam1, sinon.match.func);

    // Test function call that throws.
    await assert.isRejected(promisedFnThrow(), expectedError);
    sinon.assert.calledOnce(fnCallThrow);
    sinon.assert.calledWith(fnCallThrow, sinon.match.func);
  });
});

describe('web-ext util.promisify.multiArgsPromisedFn custom helper', () => {
  it('optionally pass multiple results to a wrapped function', async () => {
    const expectedResults = ['result1', 'result2'];
    const expectedError = new Error('Fake error');

    const fnCallMultiArgs = sinon.spy(function (behavior, cb) {
      if (behavior === 'throw') {
        throw expectedError;
      } else if (behavior === 'reject') {
        setTimeout(() => cb(expectedError));
      } else {
        setTimeout(() => cb(undefined, ...expectedResults));
      }
    });

    fnCallMultiArgs[promisifyCustom] = multiArgsPromisedFn(fnCallMultiArgs);

    const promisedFnMultiArgs = promisify(fnCallMultiArgs);

    // Test success scenario.
    await assert.becomes(promisedFnMultiArgs(undefined), expectedResults);
    sinon.assert.calledOnce(fnCallMultiArgs);
    sinon.assert.calledWith(fnCallMultiArgs, undefined, sinon.match.func);

    // Test throw scenario.
    await assert.isRejected(promisedFnMultiArgs('throw'), expectedError);
    sinon.assert.calledTwice(fnCallMultiArgs);
    sinon.assert.calledWith(fnCallMultiArgs, 'throw', sinon.match.func);

    // Test reject scenario.
    await assert.isRejected(promisedFnMultiArgs('reject'), expectedError);
    sinon.assert.calledThrice(fnCallMultiArgs);
    sinon.assert.calledWith(fnCallMultiArgs, 'reject', sinon.match.func);
  });
});

/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import promisify from '../../../src/util/promisify';

describe('util.promisify', () => {
  it('wraps a nodejs callback-based function into a promised function',
     async () => {
       const expectedParam1 = 'param-value-1';
       const expectedParam2 = 'param-value-2';
       const expectedResult = {result: 'value'};
       const expectedError = new Error('Fake error');

       const fnCallSuccess = sinon.spy(function(param1, param2, cb) {
         setTimeout(() => cb(undefined, expectedResult), 0);
       });

       const fnCallFailure = sinon.spy(function(param, cb) {
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
         expectedResult);
       sinon.assert.calledOnce(fnCallSuccess);
       sinon.assert.calledWith(
         fnCallSuccess, expectedParam1, expectedParam2, sinon.match.func);

       // Test failed promised function call.
       await assert.isRejected(
         promisedFnFailure(expectedParam1), expectedError);
       sinon.assert.calledOnce(fnCallFailure);
       sinon.assert.calledWith(fnCallFailure, expectedParam1, sinon.match.func);

       // Test function call that throws.
       await assert.isRejected(promisedFnThrow(), expectedError);
       sinon.assert.calledOnce(fnCallThrow);
       sinon.assert.calledWith(fnCallThrow, sinon.match.func);
     });

  it('optionally bind the function to a given object', async () => {
    const obj = {
      method: sinon.spy(function(cb) {
        assert.equal(this, obj, 'The method is binded on the expected object');
        cb();
      }),
    };

    const promisedFn = promisify(obj.method, obj);

    await assert.isFulfilled(promisedFn());
    sinon.assert.calledOnce(obj.method);
    sinon.assert.calledWith(obj.method, sinon.match.func);
  });

  it('optionally pass multiple results to a wrapped function', async () => {
    const expectedResults = ['result1', 'result2'];

    const fnCallMultiArgs = sinon.spy(function(cb) {
      setTimeout(() => cb(undefined, ...expectedResults));
    });

    const promisedFnMultiArgs = promisify(
      fnCallMultiArgs, null, {multiArgs: true});

    await assert.becomes(promisedFnMultiArgs(), expectedResults);
    sinon.assert.calledOnce(fnCallMultiArgs);
    sinon.assert.calledWith(fnCallMultiArgs, sinon.match.func);
  });
});

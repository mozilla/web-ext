/* @flow */
import {it, describe} from 'mocha';
import sinon from 'sinon';
import {assert} from 'chai';
import docs, {openDocs} from '../../../src/cmd/docs';


describe('docs', () => {

  function setUp() {
    const docsResult = sinon.stub(openDocs, 'openURL');
    return docsResult;
  }

  it('passes the correct URL to docs', () => {
    const docsResult = setUp();
    const expectedURL = 'https://developer.mozilla.org/en-US/Add-ons' +
       '/WebExtensions/Getting_started_with_web-ext';
    docs();
    assert.equal(docsResult.calledWith((expectedURL)), true);
  });
});
/* @flow */
import {it, describe} from 'mocha';
import sinon from 'sinon';
import {assert} from 'chai';

import docs from '../../../src/cmd/docs';


describe('docs', () => {

  it('passes the correct URL to docs', () => {
    const expectedUrl = 'https://developer.mozilla.org/en-US/Add-ons' +
       '/WebExtensions/Getting_started_with_web-ext';
    const openUrl = sinon.spy((callback) => callback(null));
    docs({}, {openUrl});
    assert.ok(openUrl.called);
    assert.equal(openUrl.firstCall.args[0], expectedUrl);
  });
});
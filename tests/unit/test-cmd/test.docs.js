/* @flow */
import {it, describe} from 'mocha';
import sinon from 'sinon';
import {assert} from 'chai';

import defaultDocsCommand from '../../../src/cmd/docs';

describe('docs', () => {

  it('passes the correct url to docs', () => {
    const expectedUrl = 'https://developer.mozilla.org/en-US/Add-ons' +
       '/WebExtensions/Getting_started_with_web-ext';
    const openUrl = sinon.spy((callback) => callback(null));
    return defaultDocsCommand({}, {openUrl}).then(() => {
    assert.ok(openUrl.called);
    assert.equal(openUrl.firstCall.args[0], expectedUrl);
    });
  });

  it('throws an error when open fails', () => {
    const openUrl = sinon.spy(
      (callback) => callback(new Error('pretends this is an error from open()'))
    );
      return defaultDocsCommand({}, {openUrl}).catch((error) => {
      assert.match(error.message, /error from open()/);
    });
  });
});
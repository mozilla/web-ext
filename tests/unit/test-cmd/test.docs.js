/* @flow */
import {it, describe} from 'mocha';
import sinon from 'sinon';
import {assert} from 'chai';

import {makeSureItFails} from '../helpers';
import defaultDocsCommand, {url} from '../../../src/cmd/docs';

describe('docs', () => {
  it('passes the correct url to docs', () => {
    const openUrl = sinon.spy((urlToOpen, callback) => callback(null));
    return defaultDocsCommand({}, {openUrl}).then(() => {
      assert.ok(openUrl.called);
      assert.equal(openUrl.firstCall.args[0], url);
    });
  });

  it('throws an error when open fails', () => {
    const openUrl = sinon.spy((urlToOpen, callback) => callback(
      new Error('pretends this is an error from open()')
    ));
    return defaultDocsCommand({}, {openUrl})
      .then(makeSureItFails()).catch((error) => {
        assert.match(error.message, /error from open()/);
      });
  });
});

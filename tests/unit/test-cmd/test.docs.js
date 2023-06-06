import { it, describe } from 'mocha';
import * as sinon from 'sinon';
import { assert } from 'chai';

import defaultDocsCommand, { url } from '../../../src/cmd/docs.js';

describe('docs', () => {
  it('passes the correct url to docs', async () => {
    const openUrl = sinon.spy(async () => {});
    await defaultDocsCommand({}, { openUrl });
    sinon.assert.calledWith(openUrl, url);
  });

  it('throws an error when open fails', async () => {
    const openUrl = sinon.spy(async () => {
      throw new Error('pretends this is an error from open()');
    });
    await assert.isRejected(
      defaultDocsCommand({}, { openUrl }),
      /error from open()/
    );
  });
});

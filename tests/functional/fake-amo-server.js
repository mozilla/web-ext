#!/usr/bin/env node

// Fake AMO signing server:
// -  http://addons-server.readthedocs.io/en/latest/topics/api/signing.html

import http from 'http';

const FAKE_REPLIES = [
  // Upload responses, see https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#upload-detail-object

  // Upload response with processed false (which is expected to polling
  // until the processed becomes true).
  {
    uuid: '{fake-upload-uuid}',
    channel: 'unlisted',
    processed: false,
  },
  // Upload response with processed false (which is expected to stop polling
  // the upload status and move to fetch the version details).
  {
    uuid: '{fake-upload-uuid}',
    channel: 'unlisted',
    processed: true,
    submitted: false,
    url: 'http://localhost:8989/fake-validation-result',
    valid: true,
    validation: {},
    version: { id: 123 },
  },

  // Version responses, see https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#version-detail.

  // Version response with file.status unreviewed (which is expected to polling
  // until the file.status becomes public).
  {
    id: 123,
    guid: 'fake-guid',
    channel: 'unlisted',
    edit_url: 'http://localhost:8989/fake-devhub-url',
    reviewed: true,
    file: {
      id: 456,
      hash: '29bd832510553001a178ecf1e74111ee65cf5286d22215008be2c23757a4e4fd',
      status: 'unreviewed',
      url: 'http://localhost:8989/fake-download-url.xpi',
    },
    version: { id: 123 },
  },
  // Version response with file.status public (which is expected to stop the
  // polling waiting for a signed xpi to download).
  {
    id: 123,
    guid: 'fake-guid',
    channel: 'unlisted',
    edit_url: 'http://localhost:8989/fake-devhub-url',
    reviewed: true,
    file: {
      id: 456,
      hash: '29bd832510553001a178ecf1e74111ee65cf5286d22215008be2c23757a4e4fd',
      status: 'public',
      url: 'http://localhost:8989/fake-download-url.xpi',
    },
    version: { id: 123 },
  },

  // Final fake xpi download response.
  {},
];

var replyIndex = 0;

http
  .createServer(function (req, res) {
    const reply = FAKE_REPLIES[replyIndex++];

    if (reply) {
      req.on('data', function () {
        // Ignore request body.
      });
      // Wait for the transfer of the request body to finish before sending a response.
      // Otherwise the client could experience an EPIPE error:
      // https://github.com/nodejs/node/issues/12339
      req.once('end', function () {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write(JSON.stringify(reply));
        res.end();
      });
    } else {
      process.exit(1);
    }
  })
  .listen(8989, '127.0.0.1', () => {
    process.stdout.write('listening');
    process.stdout.uncork();
  });

#!/usr/bin/env node

var http = require('http');

const FAKE_REPLIES = [
  {
    url: 'http://localhost:8989/validation-results/',
  },
  {
    guid: 'an-addon-guid',
    active: true,
    processed: true,
    valid: true,
    reviewed: true,
    files: [{
      signed: true,
      download_url: 'http://localhost:8989/some-signed-file-1.2.3.xpi',
    }],
  },
  {},
];

var replyIndex = 0;

http.createServer(function(req, res) {
  //  console.log("REQ", req);
  const reply = FAKE_REPLIES[replyIndex++];

  if (reply) {
    res.writeHead(200, {'content-type': 'application/json'});
    res.write(JSON.stringify(reply));
    res.end();
  } else {
    process.exit(1);
  }
}).listen(8989);

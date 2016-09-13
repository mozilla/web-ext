#!/usr/bin/env node
// Load the TCP Library
const net = require('net');

const REPLY_INITIAL = {from: 'root'};
const REQUEST_LIST_TABS = {to: 'root', type: 'listTabs'};
const REPLY_LIST_TABS = {from: 'root', addonsActor: 'fakeAddonsActor'};
const REQUEST_INSTALL_ADDON = {
  to: 'fakeAddonsActor',
  type: 'installTemporaryAddon',
  addonPath: process.env.addonPath,
};
const REPLY_INSTALL_ADDON = {
  from: 'fakeAddonsActor',
  addon: {
    id: 'fake-generated-id',
  },
};

function toRDP(msg) {
  const data = JSON.stringify(msg);
  return [data.length, ':', data].join('');
}

// Start a TCP Server
net.createServer(function(socket) {
  socket.on('data', function(data) {
    if (String(data) === toRDP(REQUEST_LIST_TABS)) {
      socket.write(toRDP(REPLY_LIST_TABS));
    } else if (String(data) === toRDP(REQUEST_INSTALL_ADDON)) {
      socket.write(toRDP(REPLY_INSTALL_ADDON));

      process.stderr.write(`${process.env.EXPECTED_MESSAGE}\n`);

      process.exit(0);
    } else {

      process.stderr.write(
        `Fake Firefox received an unexpected message: ${String(data)}\n`
      );
      process.exit(1);
    }
  });

  socket.write(toRDP(REPLY_INITIAL));
}).listen(6005);

#!/usr/bin/env node

import { createReadStream, createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

// This is a minimal simulation of a Chrome binary to test extension loading.
// For more detail on behaviors across Chrome versions, see
// https://github.com/mozilla/web-ext/issues/3388#issuecomment-2906982117

// Chrome 69 and later supports --remote-debugging-pipe.
// Chrome 126 and later supports Extensions.loadUnpacked via the pipe, provided
// that --enable-unsafe-extension-debugging is passed.
// Chrome 137 and later disables --load-extension support in official builds.

// This minimal program simulates Chrome by accepting the following args:
// - When --remote-debugging-port is passed, it starts accepting connections
//   on that port, because chrome-launcher uses successful connection as a
//   signal of the binary being ready (unless --remote-debugging-pipe is used).
//
// - --remote-debugging-pipe is always supported. When passed, the caller must
//   pass pipes at file descriptor 3 and 4. The data exchanged over these pipes
//   should be JSON terminated by a NULL byte, with the message content defined
//   by the Chrome Devtools Protocol (CDP). By default, none of the CDP methods
//   are supported.
//
// - --enable-unsafe-extension-debugging is supported unless
//   TEST_SIMULATE_DISABLE_CDP_EXTENSION is set. When supported, the CDP method
//   Extensions.loadUnpacked method is supported, which simulates an extension
//   load (see below).
//
// - --load-extension is disabled unless TEST_SIMULATE_ENABLE_LOAD_EXTENSION
//   is set. When passed, an extension load is simulated (see below).
//
// When an extension load is simulated, only the bare minimum is simulated
// (loading fixtures/chrome-extension-mv3).
const TEST_SIMULATE_CHROME_VERSION =
  parseInt(process.env.TEST_SIMULATE_CHROME_VERSION) || 137;
const TEST_SIMULATE_ENABLE_LOAD_EXTENSION = TEST_SIMULATE_CHROME_VERSION <= 136;
const TEST_SIMULATE_DISABLE_CDP_EXTENSION = TEST_SIMULATE_CHROME_VERSION < 126;

process.stdout.write(`
This is a minimal simulation of Chrome.

TEST_SIMULATE_CHROME_VERSION=${TEST_SIMULATE_CHROME_VERSION}
--load-extension supported: ${TEST_SIMULATE_ENABLE_LOAD_EXTENSION}
--enable-unsafe-extension-debugging supported: ${!TEST_SIMULATE_DISABLE_CDP_EXTENSION}
`);

let ARG_REMOTE_DEBUGGING_PORT;
let ARG_REMOTE_DEBUGGING_PIPE = false;
let ARG_ALLOW_EXTENSION_DEBUGGING = false;
let ARG_LOAD_EXTENSION;
let testServerHost = 'localhost:1337';
for (const arg of process.argv) {
  const argVal = arg.split('=').slice(1).join('=');
  // getHostResolverRulesArgForChromeBinary() in common.js sets the actual port
  // that the extension should report to.
  const hostResolverPrefix = '--host-resolver-rules=MAP localhost:1337 ';
  if (arg.startsWith(hostResolverPrefix)) {
    testServerHost = arg.slice(hostResolverPrefix.length);
  } else if (arg === '--remote-debugging-pipe') {
    // --remote-debugging-pipe can take arguments to change the wire format;
    // we only support the default (JSON) format.
    ARG_REMOTE_DEBUGGING_PIPE = true;
  } else if (arg === '--enable-unsafe-extension-debugging') {
    ARG_ALLOW_EXTENSION_DEBUGGING = true;
  } else if (arg.startsWith('--remote-debugging-port=')) {
    ARG_REMOTE_DEBUGGING_PORT = parseInt(argVal);
  } else if (arg.startsWith('--load-extension')) {
    ARG_LOAD_EXTENSION = argVal;
  }
}

const loadedFakeExtensions = new Set();

async function fakeLoadChromExtension(dir) {
  process.stderr.write(`[DEBUG] Loading Chrome extension from ${dir}\n`);

  // A very minimal simulation of loading fixtures/chrome-extension-mv3.
  const manifestPath = path.join(dir, 'manifest.json');
  const manifestData = await readFile(manifestPath, { encoding: 'utf-8' });
  const manifest = JSON.parse(manifestData);
  if (manifest.manifest_version !== 3) {
    throw new Error('Chrome only supports Manifest Version 3');
  }
  if (manifest.background.service_worker !== 'background.js') {
    throw new Error('Test extension should have script at background.js');
  }
  const bgScriptPath = path.join(dir, 'background.js');
  const bgScriptData = await readFile(bgScriptPath, { encoding: 'utf-8' });

  // In theory we could simulate a whole JS execution environment (with vm),
  // but for simplicity, just read the URL from the background script and
  // assume that the script would trigger a request to the destination.
  if (!bgScriptData.includes('http://localhost:1337/hello_from_extension')) {
    throw new Error('background.js is missing hello_from_extension');
  }
  // Fire and forget. Verify that we get the expected response from the
  // test server (startServerReceivingHelloFromExtension in common.js).
  const url = `http://${testServerHost}/hello_from_extension`;
  // Allow tests that expect a fake binary to verify that the request indeed
  // came from the fake binary.
  const headers = { 'user-agent': 'fake-chrome-binary' };
  http.get(url, { headers }, (res) => {
    if (res.statusCode !== 200) {
      throw new Error(`Unexpected status code ${res.statusCode}`);
    }
    let responseString = '';
    res.on('data', (chunk) => {
      responseString += chunk;
    });
    res.on('end', () => {
      if (responseString !== 'test server received /hello_from_extension') {
        throw new Error(`Unexpected response: ${responseString}`);
      }
    });
  });
  loadedFakeExtensions.add(dir);
  return { extensionId: 'hgobbjbpnmemikbdbflmolpneekpflab' };
}

async function handleChromeDevtoolsProtocolMessage(rawRequest) {
  // For protocol messages and behaviors across Chrome versions, see
  // https://github.com/mozilla/web-ext/issues/3388#issuecomment-2906982117
  let request;
  try {
    request = JSON.parse(rawRequest);
  } catch (e) {
    return { error: { code: -32700, message: `JSON: ${e.message}` } };
  }

  const { id, method } = request || {};
  // Sanity check: Strictly validate the input to make sure that web-ext is
  // not going to send anything that Chrome would reject.
  if (!Number.isSafeInteger(id)) {
    return {
      error: {
        code: -32600,
        message: "Message must have integer 'id' property",
      },
    };
  }
  if (typeof method !== 'string') {
    return {
      id,
      error: {
        code: -32600,
        message: "Message must have string 'method' property",
      },
    };
  }
  for (const k of Object.keys(request)) {
    if (k !== 'id' && k !== 'method' && k !== 'sessionId' && k !== 'params') {
      return {
        id,
        error: {
          code: -32600,
          message:
            "Message has property other than 'id', 'method', 'sessionId', 'params'",
        },
      };
    }
  }

  if (
    request.method === 'Extensions.loadUnpacked' &&
    !TEST_SIMULATE_DISABLE_CDP_EXTENSION
  ) {
    if (!ARG_ALLOW_EXTENSION_DEBUGGING) {
      return { id, error: { code: -32000, message: 'Method not available.' } };
    }
    if (typeof request.params?.path !== 'string') {
      // The actual message differs, but we mainly care about it being a string.
      return {
        id,
        error: {
          code: -32602,
          message: 'Invalid parameters',
          data: 'Failed to deserialize params.path - BINDINGS: string value expected (...)',
        },
      };
    }
    // No further validation: Unknown keys in params are accepted by Chrome.

    const { extensionId } = await fakeLoadChromExtension(request.params.path);
    return { id, result: { id: extensionId } };
  }

  const maybeRes = await simulateResponsesForReloadViaDeveloperPrivate(request);
  if (maybeRes) {
    return maybeRes;
  }

  return { id, error: { code: -32601, message: `'${method}' wasn't found` } };
}

let isAttachingToTarget;
async function simulateResponsesForReloadViaDeveloperPrivate(request) {
  // Supports reloadAllExtensionsFallbackForChrome125andEarlier. This is NOT
  // the full real protocol response; just enough for the simulation to work.
  // There is no validation whatsoever, since the code is designed for old
  // Chrome versions, and not going to be updated / maintained in the future.
  const { id } = request;

  if (request.method === 'Target.getTargets') {
    return { id, result: { targetInfos: [{ url: 'chrome://newtab' }] } };
  }

  if (request.method === 'Target.createTarget') {
    return { id, result: { targetId: 'FAKE_TARGET_ID' } };
  }

  if (request.method === 'Target.attachToTarget') {
    isAttachingToTarget = true;
    return { id, result: { sessionId: 'FAKE_SESSION_ID' } };
  }

  if (request.method === 'Runtime.evaluate') {
    if (!request.params.expression.includes('developerPrivate.reload')) {
      return { id, error: { message: 'Unsupported fake code!' } };
    }
    // The actual code is more elaborate, but it is equivalent to looking up
    // all extensions, reloading them, and returning the number of extensions.
    // It is possible for the first execution to be too early, in which case
    // the caller should retry.
    if (isAttachingToTarget) {
      isAttachingToTarget = false;
      return { id, result: { result: { value: 'NOT_READY_PLEASE_RETRY' } } };
    }
    const extensionsToReload = Array.from(loadedFakeExtensions);
    for (const dir of extensionsToReload) {
      await fakeLoadChromExtension(dir);
    }
    return { id, result: { result: { value: extensionsToReload.length } } };
  }

  if (request.method === 'Target.closeTarget') {
    return { id };
  }

  // Unrecognized methods - fall through to caller.
  return null;
}

if (ARG_REMOTE_DEBUGGING_PIPE) {
  const pipe3 = createReadStream(null, { fd: 3 });
  const pipe4 = createWriteStream(null, { fd: 4 });
  // If either pipe is not specified, Chrome exits immediately with:
  // "Remote debugging pipe file descriptors are not open."
  // (and somehow exit code 0 instead of non-zero)
  // We rely on Node.js raising an uncaught error on either pipe.

  let receivedData = '';
  pipe3.on('data', (chunk) => {
    receivedData += chunk;
    let end = receivedData.indexOf('\x00');
    while (end !== -1) {
      const rawRequest = receivedData.slice(0, end);
      receivedData = receivedData.slice(end + 1); // +1 = skip \x00.
      end = receivedData.indexOf('\x00');

      handleChromeDevtoolsProtocolMessage(rawRequest).then((res) => {
        const response = JSON.stringify(res);
        pipe4.write(`${response}\x00`);
      });
    }
  });
}
if (ARG_REMOTE_DEBUGGING_PORT != null) {
  // The real Chrome has a http + WebSocket server at --remote-debugging-port.
  // chrome-launcher does not rely on any commands; it just expects the server
  // to be listening, so we accept connections without doing anything.
  const server = net.createServer(() => {
    process.stderr.write('Received connection to fake DevTools server\n');
  });
  server.listen(ARG_REMOTE_DEBUGGING_PORT);
  server.on('listening', () => {
    process.stderr.write(`DevTools listening on ${server.address().port}\n`);
  });
}

if (ARG_LOAD_EXTENSION) {
  if (TEST_SIMULATE_ENABLE_LOAD_EXTENSION) {
    for (const ext of ARG_LOAD_EXTENSION.split(',')) {
      // We have very limited support for loading extensions. The following
      // may reject when an unsupported extension is encountered.
      fakeLoadChromExtension(ext);
    }
  } else {
    process.stderr.write('--load-extension is not allowed\n');
  }
}

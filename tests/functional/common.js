import { createServer } from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import copyDir from 'copy-dir';
import prettyjson from 'prettyjson';

import * as tmpDirUtils from '../../src/util/temp-dir.js';

export const withTempDir = tmpDirUtils.withTempDir;

export const functionalTestsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url || '')),
);
export const projectDir = path.join(functionalTestsDir, '..', '..');
export const webExt = process.env.TEST_WEB_EXT_BIN
  ? path.resolve(process.env.TEST_WEB_EXT_BIN)
  : path.join(projectDir, 'bin', 'web-ext');
export const fixturesDir = path.join(functionalTestsDir, '..', 'fixtures');
export const minimalAddonPath = path.join(fixturesDir, 'minimal-web-ext');
export const fixturesUseAsLibrary = path.join(fixturesDir, 'webext-as-library');
export const fakeFirefoxPath = path.join(
  functionalTestsDir,
  process.platform === 'win32'
    ? 'fake-firefox-binary.bat'
    : 'fake-firefox-binary.js',
);
export const fakeServerPath = path.join(
  functionalTestsDir,
  'fake-amo-server.js',
);

export const chromeExtPath = path.join(fixturesDir, 'chrome-extension-mv3');
// NOTE: Depends on preload_on_windows.cjs to load this!
export const fakeChromePath = path.join(
  functionalTestsDir,
  'fake-chrome-binary.js',
);

// withTempAddonDir helper

const copyDirAsPromised = promisify(copyDir);

export function withTempAddonDir({ addonPath }, makePromise) {
  return withTempDir((tmpDir) => {
    const tempAddonDir = path.join(tmpDir.path(), 'tmp-addon-dir');
    return copyDirAsPromised(addonPath, tempAddonDir).then(() => {
      process.chdir(tmpDir.path());

      return makePromise(tempAddonDir, tmpDir.path())
        .then(() => process.chdir(projectDir))
        .catch((err) => {
          process.chdir(projectDir);
          throw err;
        });
    });
  });
}

// reportCommandErrors helper

export function reportCommandErrors(obj, msg) {
  const errorMessage = msg || 'Unexpected web-ext functional test result';
  const formattedErrorData = prettyjson.render(obj);
  const error = new Error(`${errorMessage}: \n${formattedErrorData}`);
  /* eslint-disable no-console */

  // Make the error diagnostic info easier to read.
  console.error('This test failed. Please check the log below to debug.');
  /* eslint-enable no-console */

  // Make sure the test fails and error diagnostic fully reported in the failure.
  throw error;
}

// execWebExt helper

export function execWebExt(argv, spawnOptions) {
  if (spawnOptions.env) {
    spawnOptions.env = {
      // Propagate the current environment when redefining it from the `spawnOptions`
      // otherwise it may trigger unexpected failures due to missing variables that
      // may be expected (e.g. #2444 was failing only on Windows because
      // @pnpm/npm-conf, a transitive dependencies for update-notifier, was expecting
      // process.env.APPDATA to be defined when running on Windows).
      ...process.env,
      ...spawnOptions.env,
    };
  } else {
    spawnOptions.env = { ...process.env };
  }

  if (process.platform === 'win32') {
    // See preload_on_windows.cjs for an explanation.
    const preloadPath = path.join(functionalTestsDir, 'preload_on_windows.cjs');
    // NODE_OPTIONS allows values to be quoted, and anything within to be escaped
    // with a backslash: https://nodejs.org/api/cli.html#node_optionsoptions
    // https://github.com/nodejs/node/blob/411495ee9326096e88d12d3f3efae161cbd19efd/src/node_options.cc#L1717-L1741
    const escapedAbsolutePath = preloadPath.replace(/\\|"/g, '\\$&');
    spawnOptions.env.NODE_OPTIONS ||= '';
    spawnOptions.env.NODE_OPTIONS += ` --require "${escapedAbsolutePath}"`;
  }

  const spawnedProcess = spawn(
    process.execPath,
    [webExt, ...argv],
    spawnOptions,
  );

  const waitForExit = new Promise((resolve) => {
    let errorData = '';
    let outputData = '';

    spawnedProcess.stderr.on('data', (data) => (errorData += data));
    spawnedProcess.stdout.on('data', (data) => (outputData += data));

    spawnedProcess.on('close', (exitCode) => {
      resolve({
        exitCode,
        stderr: errorData,
        stdout: outputData,
      });
    });
  });

  return { argv, waitForExit, spawnedProcess };
}

export function monitorOutput(spawnedProcess) {
  const callbacks = new Set();
  let outputData = '';
  let errorData = '';
  function checkCallbacks() {
    for (const callback of callbacks) {
      const { outputTestFunc, resolve } = callback;
      if (outputTestFunc(outputData, errorData)) {
        callbacks.delete(callback);
        resolve();
      }
    }
  }
  spawnedProcess.stdout.on('data', (data) => {
    outputData += data;
    checkCallbacks();
  });
  spawnedProcess.stderr.on('data', (data) => {
    errorData += data;
    checkCallbacks();
  });

  const waitUntilOutputMatches = (outputTestFunc) => {
    return new Promise((resolve) => {
      callbacks.add({ outputTestFunc, resolve });
      checkCallbacks();
    });
  };

  return { waitUntilOutputMatches };
}

// Test server to receive request from chrome-extension-mv3, once loaded.
export async function startServerReceivingHelloFromExtension() {
  let requestCount = 0;
  let lastSeenUserAgent;
  let resolveWaitingForHelloFromExtension;
  const server = createServer((req, res) => {
    if (req.url !== '/hello_from_extension') {
      res.writeHead(404);
      res.end('test server only handles /hello_from_extension');
      return;
    }
    res.writeHead(200);
    res.end('test server received /hello_from_extension');
    lastSeenUserAgent = req.headers['user-agent'];
    ++requestCount;
    resolveWaitingForHelloFromExtension?.();
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const testServerHost = `127.0.0.1:${server.address().port}`;
  return {
    get requestCount() {
      return requestCount;
    },
    get lastSeenUserAgent() {
      return lastSeenUserAgent;
    },
    getHostResolverRulesArgForChromeBinary() {
      // chrome-extension-mv3 sends requests to http://localhost:1337, but our
      // test server uses a free port to make sure that it does not conflict
      // with an existing local server. Pass --host-resolver-rules to Chrome so
      // that it sends requests targeting localhost:1337 to this test server.
      return `--host-resolver-rules=MAP localhost:1337 ${testServerHost}`;
    },
    waitForHelloFromExtension: () => {
      return new Promise((resolve) => {
        resolveWaitingForHelloFromExtension = resolve;
      });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

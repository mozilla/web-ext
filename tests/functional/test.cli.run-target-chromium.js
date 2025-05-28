// This verifies that web-ext can be used to launch Chrome.
//
// To debug:
// 1. Run `npm run build` whenever web-ext source changes.
// 2. Run the test:
//
// With fake Chrome binary only:
//
// ./node_modules/.bin/mocha tests/functional/test.cli.run-target-chromium.js
//
// To also test with the default Chrome binary:
//
// TEST_WEBEXT_USE_REAL_CHROME=1 ./node_modules/.bin/mocha tests/functional/test.cli.run-target-chromium.js
//
// To only test with a specific Chrome binary:
//
// TEST_WEBEXT_USE_REAL_CHROME=1 CHROME_PATH=/path/to/dir/chromium ./node_modules/.bin/mocha tests/functional/test.cli.run-target-chromium.js --grep='real Chrome'
//
// Set TEST_LOG_VERBOSE=1 if you need extra verbose debugging information.
// If the test is timing out due to the binary not exiting, look at a
// recently created directory in /tmp starting with "tmp-web-ext-",
// and read its chrome-err.log and chrome-out.log files.
//
// Example of showing stderr from the last minute:
// find /tmp/ -mmin 1 -name chrome-err.log -exec cat {} \; ;echo

import path from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert, expect } from 'chai';

import {
  chromeExtPath,
  fakeChromePath,
  startServerReceivingHelloFromExtension,
  withTempAddonDir,
  execWebExt,
  monitorOutput,
} from './common.js';

// We use a fake Chrome binary below to simulate various Chrome versions.
// One test (skipped by default) verifies a real Chrome binary, optionally
// customizable via CHROME_PATH environment variable.
// This MUST be an absolute path!
const REAL_CHROME_PATH = process.env.CHROME_PATH;

const TEST_LOG_VERBOSE = Boolean(process.env.TEST_LOG_VERBOSE);

describe('web-ext run -t chromium', () => {
  let testServer;
  beforeEach(async () => {
    testServer = await startServerReceivingHelloFromExtension();
  });
  afterEach(async () => {
    testServer.close();
    testServer = null;
  });

  async function testWebExtRun({
    chromeVersion,
    useRealChrome = false,
    noReload = false,
    expectReload = false,
  }) {
    const cwd = process.cwd();
    await withTempAddonDir({ addonPath: chromeExtPath }, async (srcDir) => {
      process.chdir(srcDir);

      const argv = [
        'run',
        '-t', // -t is short for --target
        'chromium',
        `--args=${testServer.getHostResolverRulesArgForChromeBinary()}`,
        // Real Chrome may crash when sandbox is enabled.
        '--args=--no-sandbox',
        // When using non-official builds, make sure that it behaves like an
        // official build in terms of --load-extension restrictions.
        '--args=--enable-features=DisableLoadExtensionCommandLineSwitch',
      ];
      if (noReload) {
        argv.push('--no-reload');
      }
      if (TEST_LOG_VERBOSE) {
        argv.push('--verbose');
      }
      const env = {
        // web-ext uses chrome-launcher to launch Chrome. The default Chrome
        // location can be changed with the CHROME_PATH environment variable
        // (which is a documented feature of chrome-launcher).
        //
        // If useRealChrome is true, allow whoever who runs the test to pass
        // a specific Chrome binary via CHROME_PATH environment variable.
        // If not specified, chrome-launcher looks for the default Chrome.
        CHROME_PATH: useRealChrome ? REAL_CHROME_PATH : fakeChromePath,
        TEST_SIMULATE_CHROME_VERSION: chromeVersion,
      };

      if (useRealChrome && REAL_CHROME_PATH) {
        // Sanity check, to make sure that chrome-launcher will use what we
        // tell it to. Otherwise it would fall back to something else.
        assert(
          existsSync(REAL_CHROME_PATH),
          `CHROME_PATH must exist: ${REAL_CHROME_PATH}`,
        );
      }

      const cmd = execWebExt(argv, { env });
      const outputMonitor = monitorOutput(cmd.spawnedProcess);
      if (TEST_LOG_VERBOSE) {
        cmd.spawnedProcess.stderr.on('data', (d) => process.stderr.write(d));
        cmd.spawnedProcess.stdout.on('data', (d) => process.stdout.write(d));
      }

      assert.equal(testServer.requestCount, 0, 'Extension did not run yet');
      await testServer.waitForHelloFromExtension();
      assert.equal(testServer.requestCount, 1, 'Extension ran in Chrome');

      if (useRealChrome) {
        expect(testServer.lastSeenUserAgent).to.contain('Chrome/');
      } else {
        expect(testServer.lastSeenUserAgent).to.equal('fake-chrome-binary');
      }

      await outputMonitor.waitUntilOutputMatches((output) => {
        return (
          // Output of web-ext run when auto-reload is available (default).
          output.includes(
            'The extension will reload if any source file changes',
          ) ||
          // Output of web-ext run when --no-reload is passed.
          output.includes('Automatic extension reloading has been disabled')
        );
      });

      // web-ext watches for changes in the source directory, and auto-reloads
      // the extension unless --no-reload is passed to web-ext run.
      const watchedFile = path.join(srcDir, 'watchedFile.txt');
      await writeFile(watchedFile, 'Touched content', 'utf-8');

      if (expectReload) {
        if (testServer.requestCount === 1) {
          await testServer.waitForHelloFromExtension();
        }
        assert.equal(testServer.requestCount, 2, 'Extension reloaded');
      } else {
        assert.equal(testServer.requestCount, 1, 'No reload with --no-reload');
      }

      // Must send SIGINT so that chrome-launcher (used by web-ext) has a
      // chance to terminate the browser that it spawned. Using plain kill
      // can cause Chrome processes to be left behind.
      cmd.spawnedProcess.kill('SIGINT');

      // exitCode, stderr and stderr are not useful in this test:
      // - exitCode may be null, 137 or whatever because we initiate kill.
      // - stdout and stderr do not contain any info about Chrome.
      //
      // If the test is timing out due to the binary not exiting, look at a
      // recently created directory in /tmp starting with "tmp-web-ext-",
      // and read its chrome-err.log and chrome-out.log files (created by
      // chrome-launcher). These files are erased by chrome-launcher when the
      // binary exits.
      //
      // Example of showing stderr from the last minute:
      // find /tmp/ -mmin 1 -name chrome-err.log -exec cat {} \; ;echo
      await cmd.waitForExit;
      if (expectReload) {
        assert.equal(testServer.requestCount, 2, 'No unexpected requests');
      } else {
        assert.equal(testServer.requestCount, 1, 'No unexpected requests');
      }
    });
    process.chdir(cwd);
  }

  describe('--no-reload', () => {
    it('simulate Chrome 125 (--load-extension only)', async function () {
      // Chrome 125 and earlier can only load extensions via --load-extension.
      await testWebExtRun({ noReload: true, chromeVersion: 125 });
    });

    it('simulate Chrome 126 (--load-extension or --enable-unsafe-extension-debugging)', async function () {
      // Chrome 126 until 136 can load extensions via --load-extension or
      // --enable-unsafe-extension-debugging.
      await testWebExtRun({ noReload: true, chromeVersion: 126 });
    });

    it('simulate Chrome 137 (--enable-unsafe-extension-debugging only)', async function () {
      // Chrome 137 and later can only load extensions via
      // --enable-unsafe-extension-debugging plus --remote-debugging-pipe.
      await testWebExtRun({ noReload: true, chromeVersion: 137 });
    });

    it(`run real Chrome ${REAL_CHROME_PATH || ''}`, async function () {
      if (!process.env.TEST_WEBEXT_USE_REAL_CHROME) {
        // Skip by default so that we do not launch a full-blown Chrome for
        // real. To run with the real Chrome, after `npm run build`, run
        // ./node_modules/.bin/mocha tests/functional/test.cli.run-target-chromium.js --grep=real
        //
        // with the following environment variable in front of it:
        // TEST_WEBEXT_USE_REAL_CHROME=1
        //
        // to run with a specific Chrome binary,
        // TEST_WEBEXT_USE_REAL_CHROME=1 CHROME_PATH=/path/to/dir/chromium
        this.skip();
      }
      await testWebExtRun({ noReload: true, useRealChrome: true });
    });
  });

  describe('with auto-reload', () => {
    it('simulate Chrome 125 (--load-extension only)', async function () {
      await testWebExtRun({ expectReload: true, chromeVersion: 125 });
    });

    it('simulate Chrome 126 (--load-extension or --enable-unsafe-extension-debugging)', async function () {
      await testWebExtRun({ expectReload: true, chromeVersion: 126 });
    });

    it('simulate Chrome 137 (--enable-unsafe-extension-debugging only)', async function () {
      await testWebExtRun({ expectReload: true, chromeVersion: 137 });
    });

    it(`run real Chrome ${REAL_CHROME_PATH || ''}`, async function () {
      if (!process.env.TEST_WEBEXT_USE_REAL_CHROME) {
        this.skip();
      }
      await testWebExtRun({ expectReload: true, useRealChrome: true });
    });
  });
});

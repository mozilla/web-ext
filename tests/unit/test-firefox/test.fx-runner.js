import path from 'path';

import * as sinon from 'sinon';
import { describe, it, afterEach } from 'mocha';
import { assert } from 'chai';
import * as td from 'testdouble';

describe('fx-runner', () => {
  describe('linux', () => {
    let normalizeBinary;
    let execFileSyncStub;

    afterEach(async () => {
      td.reset();
    });

    async function setupLinux({ execFileSync: fakeExec } = {}) {
      execFileSyncStub = fakeExec || sinon.stub();
      await td.replaceEsm('node:child_process', {
        execFileSync: execFileSyncStub,
      });
      const mod = await import('../../../src/firefox/fx-runner/linux.js');
      normalizeBinary = mod.normalizeBinary;
    }

    it('resolves "firefox" to the result of which', async () => {
      await setupLinux({
        execFileSync: sinon.stub().returns(Buffer.from('/usr/bin/firefox\n')),
      });
      const result = normalizeBinary('firefox');
      assert.equal(result, '/usr/bin/firefox');
      sinon.assert.calledWith(execFileSyncStub, 'which', ['firefox']);
    });

    it('resolves "beta" to firefox-beta', async () => {
      await setupLinux({
        execFileSync: sinon
          .stub()
          .returns(Buffer.from('/usr/bin/firefox-beta\n')),
      });
      const result = normalizeBinary('beta');
      assert.equal(result, '/usr/bin/firefox-beta');
      sinon.assert.calledWith(execFileSyncStub, 'which', ['firefox-beta']);
    });

    it('resolves "aurora" to firefox-aurora', async () => {
      await setupLinux({
        execFileSync: sinon
          .stub()
          .returns(Buffer.from('/usr/bin/firefox-aurora\n')),
      });
      const result = normalizeBinary('aurora');
      assert.equal(result, '/usr/bin/firefox-aurora');
      sinon.assert.calledWith(execFileSyncStub, 'which', ['firefox-aurora']);
    });

    it('resolves "firefoxdeveloperedition" to firefox-developer-edition', async () => {
      await setupLinux({
        execFileSync: sinon
          .stub()
          .returns(Buffer.from('/usr/bin/firefox-developer-edition\n')),
      });
      const result = normalizeBinary('firefoxdeveloperedition');
      assert.equal(result, '/usr/bin/firefox-developer-edition');
      sinon.assert.calledWith(execFileSyncStub, 'which', [
        'firefox-developer-edition',
      ]);
    });

    it('resolves "nightly" to firefox-nightly', async () => {
      await setupLinux({
        execFileSync: sinon
          .stub()
          .returns(Buffer.from('/usr/bin/firefox-nightly\n')),
      });
      const result = normalizeBinary('nightly');
      assert.equal(result, '/usr/bin/firefox-nightly');
      sinon.assert.calledWith(execFileSyncStub, 'which', ['firefox-nightly']);
    });

    it('is case insensitive for known app names', async () => {
      await setupLinux({
        execFileSync: sinon.stub().returns(Buffer.from('/usr/bin/firefox\n')),
      });
      const result = normalizeBinary('Firefox');
      assert.equal(result, '/usr/bin/firefox');
      sinon.assert.calledWith(execFileSyncStub, 'which', ['firefox']);
    });

    it('passes through unknown names to which as-is', async () => {
      await setupLinux({
        execFileSync: sinon
          .stub()
          .returns(Buffer.from('/opt/custom/firefox-custom\n')),
      });
      const result = normalizeBinary('firefox-custom');
      assert.equal(result, '/opt/custom/firefox-custom');
      sinon.assert.calledWith(execFileSyncStub, 'which', ['firefox-custom']);
    });

    it('throws a descriptive error when which fails', async () => {
      await setupLinux({
        execFileSync: sinon.stub().throws(new Error('command failed')),
      });
      assert.throws(
        () => normalizeBinary('firefox'),
        /Could not find "firefox" on your PATH or as a Flatpak app/,
      );
    });

    it('includes the mapped binary name in the error', async () => {
      await setupLinux({
        execFileSync: sinon.stub().throws(new Error('command failed')),
      });
      assert.throws(
        () => normalizeBinary('nightly'),
        /Could not find "firefox-nightly" on your PATH or as a Flatpak app/,
      );
    });

    it('falls back to Flatpak when which fails and flatpak app is installed', async () => {
      const stub = sinon.stub();
      // First call: which firefox → fails
      stub.withArgs('which', sinon.match.any).throws(new Error('not found'));
      // Second call: flatpak info → succeeds
      stub
        .withArgs('flatpak', ['info', 'org.mozilla.firefox'], sinon.match.any)
        .returns(Buffer.from(''));
      await setupLinux({ execFileSync: stub });
      const result = normalizeBinary('firefox');
      assert.equal(result, 'flatpak:org.mozilla.firefox');
    });

    it('does not try Flatpak for apps without a known Flatpak ID', async () => {
      const stub = sinon.stub();
      stub.throws(new Error('command failed'));
      await setupLinux({ execFileSync: stub });
      assert.throws(
        () => normalizeBinary('nightly'),
        /Could not find "firefox-nightly"/,
      );
      // Only "which" should have been called, not "flatpak"
      sinon.assert.calledOnce(stub);
      sinon.assert.calledWith(stub, 'which', ['firefox-nightly']);
    });

    it('throws when both which and flatpak fail', async () => {
      const stub = sinon.stub();
      stub.throws(new Error('command failed'));
      await setupLinux({ execFileSync: stub });
      assert.throws(
        () => normalizeBinary('firefox'),
        /Could not find "firefox" on your PATH or as a Flatpak app/,
      );
    });

    it('passes through explicit flatpak: prefix when app is installed', async () => {
      const stub = sinon.stub();
      stub
        .withArgs('flatpak', ['info', 'org.mozilla.firefox'], sinon.match.any)
        .returns(Buffer.from(''));
      await setupLinux({ execFileSync: stub });
      const result = normalizeBinary('flatpak:org.mozilla.firefox');
      assert.equal(result, 'flatpak:org.mozilla.firefox');
    });

    it('throws when explicit flatpak: app is not installed', async () => {
      await setupLinux({
        execFileSync: sinon.stub().throws(new Error('not installed')),
      });
      assert.throws(
        () => normalizeBinary('flatpak:org.mozilla.firefox'),
        /Flatpak app "org.mozilla.firefox" is not installed/,
      );
    });
  });

  describe('macos', () => {
    let normalizeBinary;
    let execFileSyncStub;

    afterEach(async () => {
      td.reset();
    });

    async function setupMacos({
      execFileSync: fakeExec,
      existsSync: fakeExists,
    } = {}) {
      execFileSyncStub = fakeExec || sinon.stub().returns(Buffer.from(''));
      await td.replaceEsm('node:child_process', {
        execFileSync: execFileSyncStub,
      });
      await td.replaceEsm('node:fs', {
        default: { existsSync: fakeExists || (() => true) },
      });
      const mod = await import('../../../src/firefox/fx-runner/macos.js');
      normalizeBinary = mod.normalizeBinary;
    }

    it('resolves "firefox" to the default macOS path', async () => {
      await setupMacos();
      const result = normalizeBinary('firefox');
      assert.equal(result, '/Applications/Firefox.app/Contents/MacOS/firefox');
    });

    it('resolves "beta" to the same path as firefox', async () => {
      await setupMacos();
      const result = normalizeBinary('beta');
      assert.equal(result, '/Applications/Firefox.app/Contents/MacOS/firefox');
    });

    it('resolves "firefoxdeveloperedition" to Developer Edition path', async () => {
      await setupMacos();
      const result = normalizeBinary('firefoxdeveloperedition');
      assert.equal(
        result,
        '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
      );
    });

    it('resolves "aurora" to FirefoxAurora path', async () => {
      await setupMacos();
      const result = normalizeBinary('aurora');
      assert.equal(
        result,
        '/Applications/FirefoxAurora.app/Contents/MacOS/firefox',
      );
    });

    it('resolves "nightly" to Firefox Nightly path', async () => {
      await setupMacos();
      const result = normalizeBinary('nightly');
      assert.equal(
        result,
        '/Applications/Firefox Nightly.app/Contents/MacOS/firefox',
      );
    });

    it('appends Contents/MacOS/firefox to a .app path', async () => {
      await setupMacos();
      const result = normalizeBinary('/Custom/MyFirefox.app');
      assert.equal(result, '/Custom/MyFirefox.app/Contents/MacOS/firefox');
    });

    it('returns an arbitrary path as-is if not .app', async () => {
      await setupMacos();
      const result = normalizeBinary('/custom/path/to/firefox-bin');
      assert.equal(result, '/custom/path/to/firefox-bin');
    });

    it('uses findMacAppByChannel for known channel names', async () => {
      // mdfind returns .app bundle paths, normalizeBinary appends Contents/MacOS/firefox
      const appBundle = '/Users/test/Applications/Firefox Nightly.app';
      await setupMacos({
        execFileSync: sinon.stub().returns(Buffer.from(`${appBundle}\n`)),
      });
      const result = normalizeBinary('nightly');
      assert.equal(result, `${appBundle}/Contents/MacOS/firefox`);
      sinon.assert.calledWith(execFileSyncStub, 'mdfind', sinon.match.array);
    });

    it('prefers /Applications result from mdfind', async () => {
      const officialBundle = '/Applications/Firefox Nightly.app';
      const otherBundle = '/Users/test/Nightly.app';
      await setupMacos({
        execFileSync: sinon
          .stub()
          .returns(
            Buffer.from(`${[otherBundle, officialBundle].join('\n')}\n`),
          ),
      });
      const result = normalizeBinary('nightly');
      assert.equal(result, `${officialBundle}/Contents/MacOS/firefox`);
    });

    it('falls back to default path when mdfind returns empty', async () => {
      await setupMacos({
        execFileSync: sinon.stub().returns(Buffer.from('')),
      });
      const result = normalizeBinary('nightly');
      assert.equal(
        result,
        '/Applications/Firefox Nightly.app/Contents/MacOS/firefox',
      );
    });

    it('throws a descriptive error when binary does not exist', async () => {
      await setupMacos({
        existsSync: () => false,
      });
      assert.throws(
        () => normalizeBinary('firefox'),
        /Could not find Firefox at "\/Applications\/Firefox\.app\/Contents\/MacOS\/firefox"/,
      );
    });
  });

  describe('windows', () => {
    let normalizeBinary;
    let execFileSyncStub;
    const originalEnv = { ...process.env };

    afterEach(async () => {
      td.reset();
      process.env = { ...originalEnv };
    });

    async function setupWindows({
      execFileSync: fakeExec,
      existsSync: fakeExists,
    } = {}) {
      execFileSyncStub = fakeExec || sinon.stub();
      await td.replaceEsm('node:child_process', {
        execFileSync: execFileSyncStub,
      });
      await td.replaceEsm('node:fs', {
        default: { existsSync: fakeExists || (() => true) },
      });
      const mod = await import('../../../src/firefox/fx-runner/win.js');
      normalizeBinary = mod.normalizeBinary;
    }

    function makeRegQueryStub(responses) {
      // responses is a map of `${hive}${key}` -> value
      return sinon.stub().callsFake((cmd, args) => {
        const fullKey = args[1]; // e.g. "HKCU\\Software\\Mozilla\\..."
        const name = args[3]; // e.g. "CurrentVersion" or "PathToExe"
        const key = `${fullKey}|${name}`;
        if (responses[key] !== undefined) {
          return `\n    ${name}    REG_SZ    ${responses[key]}\n`;
        }
        throw new Error(`Registry key not found: ${key}`);
      });
    }

    it('returns an .exe path as-is', async () => {
      await setupWindows();
      const result = normalizeBinary(
        'C:\\Program Files\\Firefox\\firefox.exe',
        '',
      );
      assert.equal(result, 'C:\\Program Files\\Firefox\\firefox.exe');
    });

    it('resolves "firefox" via HKCU registry', async () => {
      const expectedPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
      await setupWindows({
        execFileSync: makeRegQueryStub({
          'HKCU\\Software\\Mozilla\\Mozilla Firefox|CurrentVersion': '100.0',
          'HKCU\\Software\\Mozilla\\Mozilla Firefox\\100.0\\Main|PathToExe':
            expectedPath,
        }),
      });
      const result = normalizeBinary('firefox', '');
      assert.equal(result, expectedPath);
    });

    it('falls back to HKLM when HKCU fails', async () => {
      const expectedPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
      await setupWindows({
        execFileSync: sinon.stub().callsFake((cmd, args) => {
          const fullKey = args[1];
          const name = args[3];
          if (fullKey.startsWith('HKCU')) {
            throw new Error('HKCU not found');
          }
          if (name === 'CurrentVersion') {
            return '\n    CurrentVersion    REG_SZ    100.0\n';
          }
          if (name === 'PathToExe') {
            return `\n    PathToExe    REG_SZ    ${expectedPath}\n`;
          }
          throw new Error('Unexpected call');
        }),
      });
      const result = normalizeBinary('firefox', '');
      assert.equal(result, expectedPath);
    });

    it('falls back to env var path when both registry hives fail', async () => {
      process.env.ProgramFiles = 'C:\\Program Files';
      await setupWindows({
        execFileSync: sinon.stub().throws(new Error('Registry not available')),
      });
      const result = normalizeBinary('firefox', '');
      assert.equal(
        result,
        path.join('C:\\Program Files', 'Mozilla Firefox', 'firefox.exe'),
      );
    });

    it('uses ProgramFiles(x86) for 64-bit arch', async () => {
      process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)';
      await setupWindows({
        execFileSync: sinon.stub().throws(new Error('Registry not available')),
      });
      const result = normalizeBinary('firefox', '(64)');
      assert.equal(
        result,
        path.join('C:\\Program Files (x86)', 'Mozilla Firefox', 'firefox.exe'),
      );
    });

    it('resolves "nightly" via registry', async () => {
      const expectedPath = 'C:\\Program Files\\Nightly\\firefox.exe';
      await setupWindows({
        execFileSync: makeRegQueryStub({
          'HKCU\\Software\\Mozilla\\Nightly|CurrentVersion': '120.0a1',
          'HKCU\\Software\\Mozilla\\Nightly\\120.0a1\\Main|PathToExe':
            expectedPath,
        }),
      });
      const result = normalizeBinary('nightly', '');
      assert.equal(result, expectedPath);
    });

    it('resolves "firefoxdeveloperedition" via registry', async () => {
      const expectedPath =
        'C:\\Program Files\\Firefox Developer Edition\\firefox.exe';
      await setupWindows({
        execFileSync: makeRegQueryStub({
          'HKCU\\Software\\Mozilla\\Firefox Developer Edition|CurrentVersion':
            '120.0b1',
          'HKCU\\Software\\Mozilla\\Firefox Developer Edition\\120.0b1\\Main|PathToExe':
            expectedPath,
        }),
      });
      const result = normalizeBinary('firefoxdeveloperedition', '');
      assert.equal(result, expectedPath);
    });

    it('resolves "beta" using Mozilla Firefox registry key', async () => {
      const expectedPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
      await setupWindows({
        execFileSync: makeRegQueryStub({
          'HKCU\\Software\\Mozilla\\Mozilla Firefox|CurrentVersion': '120.0',
          'HKCU\\Software\\Mozilla\\Mozilla Firefox\\120.0\\Main|PathToExe':
            expectedPath,
        }),
      });
      const result = normalizeBinary('beta', '');
      assert.equal(result, expectedPath);
    });

    it('resolves "aurora" via registry', async () => {
      const expectedPath = 'C:\\Program Files\\Aurora\\firefox.exe';
      await setupWindows({
        execFileSync: makeRegQueryStub({
          'HKCU\\Software\\Mozilla\\Aurora|CurrentVersion': '120.0a2',
          'HKCU\\Software\\Mozilla\\Aurora\\120.0a2\\Main|PathToExe':
            expectedPath,
        }),
      });
      const result = normalizeBinary('aurora', '');
      assert.equal(result, expectedPath);
    });

    it('throws a descriptive error when fallback path does not exist', async () => {
      process.env.ProgramFiles = 'C:\\Program Files';
      await setupWindows({
        execFileSync: sinon.stub().throws(new Error('Registry not available')),
        existsSync: () => false,
      });
      assert.throws(
        () => normalizeBinary('firefox', ''),
        /Could not find Firefox at/,
      );
    });
  });
});

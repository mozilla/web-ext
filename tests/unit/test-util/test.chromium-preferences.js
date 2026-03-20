import { describe, it } from 'mocha';
import { assert } from 'chai';

import { UsageError } from '../../../src/errors.js';
import { coerceCLICustomChromiumPreference } from '../../../src/util/chromium-preferences.js';

describe('util/chromium-preferences', () => {
  describe('coerceCLICustomChromiumPreference', () => {
    it('converts cli preferences into a Map', () => {
      const prefs = coerceCLICustomChromiumPreference([
        'extensions.ui.developer_mode=false',
        'browser.theme.color=dark',
      ]);

      assert.instanceOf(prefs, Map);
      assert.strictEqual(prefs.get('extensions.ui.developer_mode'), false);
      assert.strictEqual(prefs.get('browser.theme.color'), 'dark');
    });

    it('converts integer values', () => {
      const prefs = coerceCLICustomChromiumPreference(['some.int.pref=455']);

      assert.strictEqual(prefs.get('some.int.pref'), 455);
    });

    it('supports string values containing equals signs', () => {
      const prefs = coerceCLICustomChromiumPreference([
        'some.string.pref=value=with=equals',
      ]);

      assert.strictEqual(prefs.get('some.string.pref'), 'value=with=equals');
    });

    it('throws on incomplete preferences', () => {
      assert.throws(
        () => coerceCLICustomChromiumPreference(['invalid.preference']),
        UsageError,
        'Incomplete custom preference: "invalid.preference". ' +
          'Syntax expected: "prefname=prefvalue".',
      );
    });

    it('accepts permissive Chromium preference keys', () => {
      const prefs = coerceCLICustomChromiumPreference([
        'net.http.server_properties:https://example.com=true',
      ]);

      assert.strictEqual(
        prefs.get('net.http.server_properties:https://example.com'),
        true,
      );
    });
  });
});

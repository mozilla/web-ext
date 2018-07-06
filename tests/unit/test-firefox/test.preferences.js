/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import {WebExtError, UsageError} from '../../../src/errors';
import {
  getPrefs, coerceCLICustomPreference, nonOverridablePreferences,
} from '../../../src/firefox/preferences';


describe('firefox/preferences', () => {

  describe('getPrefs', () => {

    it('gets Firefox prefs with some defaults', () => {
      const prefs = getPrefs();
      // This is a commonly shared pref.
      assert.equal(prefs['devtools.debugger.remote-enabled'], true);
      // This is a Firefox only pref.
      assert.equal(prefs['devtools.chrome.enabled'], true);
      // This is a Firefox only pref that we set to prevent Firefox
      // to open the privacy policy info page on every "web-ext run".
      assert.equal(prefs['datareporting.policy.firstRunURL'], '');
    });

    it('gets Fennec prefs with some defaults', () => {
      const prefs = getPrefs('fennec');
      // This is a commonly shared pref.
      assert.equal(prefs['devtools.debugger.remote-enabled'], true);
      // This is a Fennec only pref.
      assert.equal(prefs['browser.console.showInPanel'], true);
    });

    it('throws an error for unsupported apps', () => {
      // $FLOW_IGNORE: ignore type errors on testing nonexistent 'thunderbird' prefs
      assert.throws(() => getPrefs('thunderbird'),
                    WebExtError, /Unsupported application: thunderbird/);
    });

  });

  describe('coerceCLICustomPreference', () => {

    it('converts a single --pref cli option from string to object', () => {
      const prefs = coerceCLICustomPreference(['valid.preference=true']);
      assert.isObject(prefs);
      assert.equal(prefs['valid.preference'], true);
    });

    it('converts array of --pref cli option values into object', () => {
      const prefs = coerceCLICustomPreference([
        'valid.preference=true', 'valid.preference2=false',
      ]);
      assert.isObject(prefs);
      assert.equal(prefs['valid.preference'], true);
      assert.equal(prefs['valid.preference2'], false);
    });

    it('converts boolean values', () => {
      const prefs = coerceCLICustomPreference(['valid.preference=true']);
      assert.equal(prefs['valid.preference'], true);
    });

    it('converts number values', () => {
      const prefs = coerceCLICustomPreference(['valid.preference=455']);
      assert.equal(prefs['valid.preference'], 455);
    });

    it('converts float values', () => {
      const prefs = coerceCLICustomPreference(['valid.preference=4.55']);
      assert.equal(prefs['valid.preference'], '4.55');
    });

    it('supports string values with "=" chars', () => {
      const prefs = coerceCLICustomPreference(
        ['valid.preference=value=withequals=chars']
      );
      assert.equal(prefs['valid.preference'], 'value=withequals=chars');
    });

    it('does not allow certain default preferences to be customized', () => {
      const nonChangeablePrefs = nonOverridablePreferences.map((prop) => {
        return prop += '=true';
      });
      const prefs = coerceCLICustomPreference(nonChangeablePrefs);
      for (const pref of nonChangeablePrefs) {
        assert.isUndefined(prefs[pref], `${pref} should be undefined`);
      }
    });

    it('throws an error for invalid or incomplete preferences', () => {
      assert.throws(
        () => coerceCLICustomPreference(['test.invalid.prop']),
        UsageError,
        'Incomplete custom preference: "test.invalid.prop". ' +
        'Syntax expected: "prefname=prefvalue".'
      );

      assert.throws(() => coerceCLICustomPreference(['*&%£=true']),
                    UsageError,
                    'Invalid custom preference name: *&%£');
    });

  });

});

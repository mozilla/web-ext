/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import {WebExtError, UsageError} from '../../../src/errors';
import {
  getPrefs, coerceCLICustomPreference,
} from '../../../src/firefox/preferences';


describe('firefox/preferences', () => {

  describe('getPrefs', () => {

    it('gets Firefox prefs with some defaults', () => {
      let prefs = getPrefs();
      // This is a commonly shared pref.
      assert.equal(prefs['devtools.debugger.remote-enabled'], true);
      // This is a Firefox only pref.
      assert.equal(prefs['devtools.chrome.enabled'], true);
    });

    it('gets Fennec prefs with some defaults', () => {
      let prefs = getPrefs('fennec');
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
      const prefs = coerceCLICustomPreference('valid.preference=true');
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
      const prefs = coerceCLICustomPreference('valid.preference=true');
      assert.equal(prefs['valid.preference'], true);
    });

    it('converts number values', () => {
      const prefs = coerceCLICustomPreference('valid.preference=455');
      assert.equal(typeof prefs['valid.preference'], 'number');
    });

    it('converts float values', () => {
      const prefs = coerceCLICustomPreference('valid.preference=4.55');
      assert.equal(prefs['valid.preference'], '4.55');
    });

    it('does not allow certain default preferences to be customized', () => {
      const prefs = coerceCLICustomPreference('xpinstall.signatures.required');
      assert.equal(typeof(prefs['xpinstall.signatures.required']), 'undefined');
    });

    it('throws an error for invalid preferences', () => {
      assert.throws(() => coerceCLICustomPreference('*&%£=true'),
                    UsageError,
                    'UsageError: Invalid custom preference name: *&%£');
    });

  });

});

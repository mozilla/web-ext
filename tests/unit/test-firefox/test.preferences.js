/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import {WebExtError, UsageError} from '../../../src/errors';
import {getPrefs, coerceCLICustomPreference}
  from '../../../src/firefox/preferences';


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

    it('convert the preferences from string to object', () => {
      let prefs = coerceCLICustomPreference(
                  'valid.preference=true');
      assert.equal(typeof prefs, 'object');
      assert.equal(prefs['valid.preference'], true);
    });

    it('convert array of preferences into object', () => {
      let prefs = coerceCLICustomPreference(
                  'valid.preference=true', 'valid.preference2=false');
      assert.equal(typeof prefs, 'object');
      assert.equal(prefs['valid.preference'], true);
      assert.equal(prefs['valid.preference2'], false);
    });

    it('converts boolean values', () => {
      let prefs = coerceCLICustomPreference(
                  'valid.preference=true');
      assert.equal(typeof prefs['valid.preference'], 'boolean');
    });

    it('converts number values', () => {
      let prefs = coerceCLICustomPreference(
                  'valid.preference=455');
      assert.equal(typeof prefs['valid.preference'], 'number');
    });

    it('throws an error for invalid prefernces', () => {
      assert.throws(() => coerceCLICustomPreference('*&%£=true'),
                    UsageError,
                    'UsageError: Invalid custom preference name: *&%£');
    });

  });

});

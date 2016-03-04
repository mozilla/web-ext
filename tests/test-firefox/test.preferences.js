/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import {WebExtError} from '../../src/errors';
import {getPrefs} from '../../src/firefox/preferences';


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
      assert.throws(() => getPrefs('thunderbird'),
                    WebExtError, /Unsupported application: thunderbird/);
    });

  });

});

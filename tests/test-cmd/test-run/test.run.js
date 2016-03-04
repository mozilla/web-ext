import {assert} from 'chai';

import * as firefox from '../../../src/firefox';
import {fake} from '../../helpers';
import {fixturePath} from '../../helpers';

import * as adapter from './adapter';


describe('run', () => {

  function getFakeFirefox(implementations={}) {
    let allImplementations = {
      createProfile: () => {
        let profile = {}; // empty object just to avoid errors.
        return Promise.resolve(profile);
      },
      installExtension: () => Promise.resolve(),
      ...implementations,
    };
    return fake(firefox, allImplementations);
  }

  it('installs and runs the extension', () => {

    let profile = {};
    let fakeFirefox = getFakeFirefox({
      createProfile: () => Promise.resolve(profile),
    });

    return adapter.run(fixturePath('minimal-web-ext'), fakeFirefox)
      .then(() => {

        let install = fakeFirefox.installExtension;
        assert.equal(install.called, true);
        assert.equal(
            install.firstCall.args[0].manifestData.applications.gecko.id,
            'minimal-example@web-ext-test-suite');
        assert.deepEqual(install.firstCall.args[0].profile, profile);
        assert.match(install.firstCall.args[0].extensionPath,
                     /minimal_extension-1\.0\.xpi/);

        assert.equal(fakeFirefox.run.called, true);
        assert.deepEqual(fakeFirefox.run.firstCall.args[0], profile);
      });
  });

  it('passes a custom Firefox binary when specified', () => {
    let firefoxBinary = '/pretend/path/to/Firefox/firefox-bin';
    let fakeFirefox = getFakeFirefox();
    return adapter.runWithFirefox(
        fixturePath('minimal-web-ext'), fakeFirefox, firefoxBinary)
      .then(() => {
        assert.equal(fakeFirefox.run.called, true);
        assert.equal(fakeFirefox.run.firstCall.args[1].firefoxBinary,
                     firefoxBinary);
      });
  });

});

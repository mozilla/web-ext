/* @flow */
import {describe, it} from 'mocha';
import {assert} from 'chai';

import run from '../../src/cmd/run';
import * as firefox from '../../src/firefox';
import {fake, fixturePath} from '../helpers';


describe('run', () => {

  function runMinimalExt(argv={}, ...optionalArgs) {
    return run({sourceDir: fixturePath('minimal-web-ext'), ...argv},
               ...optionalArgs);
  }

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

    return runMinimalExt({}, {firefox: fakeFirefox})
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
    return runMinimalExt({firefoxBinary}, {firefox: fakeFirefox})
      .then(() => {
        assert.equal(fakeFirefox.run.called, true);
        assert.equal(fakeFirefox.run.firstCall.args[1].firefoxBinary,
                     firefoxBinary);
      });
  });

});

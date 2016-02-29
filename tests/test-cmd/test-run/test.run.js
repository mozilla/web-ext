import {assert} from 'chai';

import * as firefox from '../../../src/firefox';
import {fake} from '../../helpers';
import {fixturePath} from '../../helpers';

import * as adapter from './adapter';


describe('run', () => {

  it('installs and runs the extension', () => {

    let profile = {};

    let fakeFirefox = fake(firefox, {
      createProfile: () => Promise.resolve(profile),
      installExtension: () => Promise.resolve(),
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

});

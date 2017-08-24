import {it, describe} from 'mocha';
import {assert} from 'chai';
import {fs} from 'mz';

import {parseJSON} from '../../../src/util/json';
import {basicManifest} from '../helpers';


describe('util.parseJSON', () => {

  it('returns a parsed JSON', () => {
    const parsedJSON = parseJSON(JSON.stringify(basicManifest));
    assert.deepEqual(parsedJSON, basicManifest);
  });

  it('returns a parsed JSON from file with BOM Chanracter', () => {
    const dummyJson = { manifest_version: 2 };
    fs.readFile('./test.manifest.json', function read(err, data) {
      if (err) {
        throw err;
      }
      assert.deepEqual(parseJSON(data), dummyJson);
    });

  });

});

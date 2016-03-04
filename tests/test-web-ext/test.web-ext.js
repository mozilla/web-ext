/*
 * This tests the actual command line tool from a real process.
 *
 * DO NOT add tests to this unless you have a really good reason to.
 * Add a unit test instead.
 *
 */

import path from 'path';
import {readFileSync} from 'fs';
import {assert} from 'chai';
import shell from 'shelljs';


describe('web-ext', () => {

  // This is a smoke test just to make sure the command line script
  // doesn't explode.

  it('prints the current version number', (done) => {
    let pkg = JSON.parse(
      readFileSync(path.join(__dirname, '..', '..', 'package.json')));
    let cmd = 'bin/web-ext --version';
    shell.exec(cmd, {silent: true}, (code, output) => {
      assert.equal(output.trim(), pkg.version);
      assert.equal(code, 0, output);
      done();
    });
  });

});

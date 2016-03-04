/* @flow */
/*
 * This tests the actual command line tool from a real process.
 *
 * DO NOT add tests to this unless you have a really good reason to.
 * Add a unit test instead.
 *
 */
import path from 'path';
import {describe, it} from 'mocha';
import {assert} from 'chai';
import shell from 'shelljs';


describe('web-ext', () => {

  // This is a smoke test just to make sure the command line script
  // doesn't explode.

  it('shows help', (done) => {
    let webExt = path.join(path.resolve(__dirname), '..', 'bin', 'web-ext');
    shell.exec(`${webExt} --help`, {silent: true},
      (code, stdout, stderr) => {
        assert.equal(code, 0, stdout + stderr);
        assert.match(stdout, /Usage: .*web-ext.*/);
        done();
      });
  });

});

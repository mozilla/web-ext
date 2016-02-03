/*
 * Tests running the process via the CLI.
 *
 * NOTE: Write these tests sparingly. Consider writing a unit test of the
 * cli module instead.
 *
 */

import path from 'path';
import {readFileSync} from 'fs';
import {assert} from 'chai';
import shell from 'shelljs';


describe('bin/web-ext', function() {

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

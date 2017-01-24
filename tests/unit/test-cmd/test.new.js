/* @flow */
import path from 'path';

import {fs} from 'mz';
import {describe, it, after} from 'mocha';
import {assert} from 'chai';

import newCommand from '../../../src/cmd/new';
import {withTempDir} from '../../../src/util/temp-dir';

const homeDir = process.cwd();

describe('new', () => {

  after(() => {
    process.chdir(homeDir);
  });

  it('creates manifest json file with approriate ', () => withTempDir(
    (tmpDir) => {
      const targetDir = path.join(tmpDir.path(), 'target');
      return fs.mkdir(targetDir)
        .then(() => {
          process.chdir(targetDir);
          return newCommand()
            .then(() => {
              return fs.readFile('manifest.json', 'utf-8')
                .then((data) => {
                  const manifest = JSON.parse(data);
                  assert.equal(manifest.name, 'target');
                });
            });
        });
    }));
});

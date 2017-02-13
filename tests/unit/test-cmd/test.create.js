/* @flow */
import path from 'path';

import {fs} from 'mz';
import {describe, it, afterEach} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import create from '../../../src/cmd/create';
import {withTempDir} from '../../../src/util/temp-dir';
import {makeSureItFails} from '../helpers';

const homeDir = process.cwd();

describe('create', () => {

  afterEach(() => {
    process.chdir(homeDir);
  });

  it('creates files including manifest with correct name ', () => withTempDir(
    (tmpDir) => {
      process.chdir(tmpDir.path());
      const targetDir = path.join(tmpDir.path(), 'target');
      const manifest = path.join(targetDir, 'manifest.json');
      return create({name: 'target'})
        .then(() => {
          return fs.stat(path.join(targetDir, 'content.js'))
            .then((contentstat) => {
              assert.equal(contentstat.isDirectory(), false);
              return fs.stat(path.join(targetDir, 'background.js'))
                .then((bgstat) => {
                  assert.equal(bgstat.isDirectory(), false);
                  return fs.readFile(manifest, 'utf-8')
                    .then((data) => {
                      const parsed = JSON.parse(data);
                      assert.equal(parsed.name, 'target (name)');
                    });
                });
            });
        });
    }));

  it('does not overwrit existing directory if user aborts', () => withTempDir(
      (tmpDir) => {
        process.chdir(tmpDir.path());
        const targetDir = path.join(tmpDir.path(), 'target');
        const fakePause = sinon.spy(() => Promise.resolve());
        fs.mkdir('target');
        setTimeout(() => {
          process.stdin.emit('keypress', 'n', {name: 'n', ctrl: false});
        }, 2000);
        return create({name: 'target', pause: fakePause})
          .then(() => {
            return fs.readFile(path.join(targetDir, 'manifest.json'), 'utf-8')
              .then(makeSureItFails())
              .catch((error) => {
                assert.equal(error.code, 'ENOENT');
              });
          });
      }));

  it('overwrites existing directory if user allows', () => withTempDir(
    (tmpDir) => {
      process.chdir(tmpDir.path());
      const targetDir = path.join(tmpDir.path(), 'target');
      const fakePause = sinon.spy(() => Promise.resolve());
      fs.mkdir('target');
      setTimeout(() => {
        process.stdin.emit('keypress', 'y', {name: 'y', ctrl: false});
      }, 2000);
      return create({name: 'target', pause: fakePause})
        .then(() => {
          return fs.readFile(path.join(targetDir, 'manifest.json'), 'utf-8')
            .then((data) => {
              const manifest = JSON.parse(data);
              assert.equal(manifest.name, 'target (name)');
              assert.ok(fakePause.called);
            });
        });
    }));

});

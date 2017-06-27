/* @flow */
import path from 'path';
import tty from 'tty';

import {fs} from 'mz';
import {describe, it, afterEach} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';
import mockStdin from 'mock-stdin';
import rimraf from 'rimraf';

import create from '../../../src/cmd/create';
import {withTempDir} from '../../../src/util/temp-dir';
import {makeSureItFails} from '../helpers';
import {onlyInstancesOf, UsageError} from '../../../src/errors';

const homeDir = process.cwd();

describe('create', () => {

  afterEach(() => {
    process.chdir(homeDir);
  });

  async function cleanTmpDir(dir) {
    rimraf(dir, (error) => {
      if (error) {
        throw error;
      }
    });
  }

  it('creates files including manifest with correct name', () => withTempDir(
    (tmpDir) => {
      process.chdir(tmpDir.path());
      const targetDir = path.join(tmpDir.path(), 'target');
      const manifest = path.join(targetDir, 'manifest.json');
      return create({dirPath: 'target'})
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
                    })
                    .then(
                      () => cleanTmpDir(targetDir),
                      () => cleanTmpDir(targetDir)
                    );
                });
            });
        });
    }));

  it('creates directory recursively when needed', () => withTempDir(
    (tmpDir) => {
      process.chdir(tmpDir.path());
      const targetDir = path.join(tmpDir.path(), 'sub/target');
      const manifest = path.join(targetDir, 'manifest.json');
      return create({dirPath: 'sub/target'})
        .then(() => {
          return fs.stat(path.join(targetDir))
            .then((contentstat) => {
              assert.equal(contentstat.isDirectory(), true);
              return fs.readFile(manifest, 'utf-8')
                .then((data) => {
                  const parsed = JSON.parse(data);
                  assert.equal(parsed.name, 'target (name)');
                })
                .then(
                  () => cleanTmpDir(targetDir),
                  () => cleanTmpDir(targetDir)
                );
            });
        });
    }));

  it('does not overwrite existing directory if user aborts', () => withTempDir(
      (tmpDir) => {
        process.chdir(tmpDir.path());
        const targetDir = path.join(tmpDir.path(), 'target');
        const fakeStdin = new tty.ReadStream();
        fs.mkdir('target');
        setTimeout(() => {
          fakeStdin.emit('keypress', 'n', {name: 'n', ctrl: false});
        }, 50);
        return create({dirPath: 'target', stdin: fakeStdin})
          .then(() => {
            return fs.readFile(path.join(targetDir, 'manifest.json'), 'utf-8')
              .then(makeSureItFails())
              .catch((error) => {
                assert.equal(error.code, 'ENOENT');
              })
              .then(
                () => cleanTmpDir(targetDir),
                () => cleanTmpDir(targetDir)
              );
          });
      }));

  it('overwrites existing directory if user allows', () => withTempDir(
    (tmpDir) => {
      process.chdir(tmpDir.path());
      const targetDir = path.join(tmpDir.path(), 'target');
      const fakeStdin = new tty.ReadStream();
      sinon.spy(fakeStdin, 'pause');
      fs.mkdir('target');
      setTimeout(() => {
        fakeStdin.emit('keypress', 'y', {name: 'y', ctrl: false});
      }, 50);
      return create({dirPath: 'target', stdin: fakeStdin})
        .then(() => {
          return fs.readFile(path.join(targetDir, 'manifest.json'), 'utf-8')
            .then((data) => {
              const manifest = JSON.parse(data);
              assert.equal(manifest.name, 'target (name)');
              assert.ok(fakeStdin.pause.called);
            })
            .then(
              () => cleanTmpDir(targetDir),
              () => cleanTmpDir(targetDir)
            );
        });
    }));

  it('throws error when user cannot confirm overwriting', () => withTempDir(
    (tmpDir) => {
      process.chdir(tmpDir.path());
      mockStdin.isTTY = false;
      fs.mkdir('target');
      return create({dirPath: 'target', stdin: mockStdin})
        .then(makeSureItFails())
        .catch(onlyInstancesOf(UsageError, (error) => {
          assert.match(error.message, /without user confirmation/);
        }))
        .then(
          () => cleanTmpDir(path.join(tmpDir.path(), 'target')),
          () => cleanTmpDir(path.join(tmpDir.path(), 'target'))
        );
    }));

});

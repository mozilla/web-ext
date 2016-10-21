/* @flow */
import {fs} from 'mz';
import path from 'path';
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import build, {
  safeFileName,
  FileFilter,
  getDefaultLocalizedName,
} from '../../../src/cmd/build';
import {withTempDir} from '../../../src/util/temp-dir';
import {fixturePath, makeSureItFails, ZipFile} from '../helpers';
import {
  basicManifest,
  manifestWithoutApps,
} from '../test-util/test.manifest';
import {UsageError} from '../../../src/errors';
import {createLogger} from '../../../src/util/logger';

const log = createLogger(__filename);

describe('build', () => {

  it('zips a package', () => {
    let zipFile = new ZipFile();

    return withTempDir(
      (tmpDir) =>
        build({
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir: tmpDir.path(),
        })
          .then((buildResult) => {
            assert.match(buildResult.extensionPath,
                         /minimal_extension-1\.0\.zip$/);
            return buildResult.extensionPath;
          })
          .then((extensionPath) => zipFile.open(extensionPath))
          .then(() => zipFile.extractFilenames())
          .then((fileNames) => {
            fileNames.sort();
            assert.deepEqual(fileNames,
                             ['background-script.js', 'manifest.json']);
          })
    );
  });

  it('gives the correct name to a localized extension', () => {
    return withTempDir(
      (tmpDir) =>
        build({
          sourceDir: fixturePath('minimal-localizable-web-ext'),
          artifactsDir: tmpDir.path(),
        })
          .then((buildResult) => {
            assert.match(buildResult.extensionPath,
                         /name_of_the_extension-1\.0\.zip$/);
            return buildResult.extensionPath;
          })
    );
  });

  it('handles repeating localization keys', () => {
    return withTempDir(
      (tmpDir) => {
        const messageFileName = path.join(tmpDir.path(), 'messages.json');
        fs.writeFileSync(messageFileName,
          `{"extensionName": {
              "message": "example extension",
              "description": "example description"
            }
          }`);

        const manifestWithRepeatingPattern = {
          name: '__MSG_extensionName__ __MSG_extensionName__',
          version: '0.0.1',
        };

        return getDefaultLocalizedName({
          messageFile: messageFileName,
          manifestData: manifestWithRepeatingPattern,
        })
          .then((result) => {
            assert.match(result, /example extension example extension/);
          });
      }
    );
  });

  it('checks locale file for malformed json', () => {
    return withTempDir(
      (tmpDir) => {
        const messageFileName = path.join(tmpDir.path(), 'messages.json');
        fs.writeFileSync(messageFileName,
          '{"simulated:" "json syntax error"');
        return getDefaultLocalizedName({
          messageFile: messageFileName,
          manifestData: manifestWithoutApps,
        })
          .then(makeSureItFails())
          .catch((error) => {
            assert.instanceOf(error, UsageError);
            assert.match(
              error.message,
              /Error .* file .*messages\.json: SyntaxError: Unexpected string/);
          });
      }
    );
  });

  it('checks locale file for incorrect format', () => {
    return withTempDir(
      (tmpDir) => {
        const messageFileName = path.join(tmpDir.path(), 'messages.json');
        //This is missing the 'message' key
        fs.writeFileSync(messageFileName,
          `{"extensionName": {
              "description": "example extension"
              }
          }`);
        const basicLocalizedManifest = {
          name: '__MSG_extensionName__',
          version: '0.0.1',
        };
        return getDefaultLocalizedName({
          messageFile: messageFileName,
          manifestData: basicLocalizedManifest,
        })
          .then(makeSureItFails())
          .catch((error) => {
            assert.instanceOf(error, UsageError);
            assert.match(
              error.message,
              /The locale file .*messages\.json is missing key: extensionName/);
          });
      }
    );
  });

  it('throws an error if the locale file does not exist', () => {
    return getDefaultLocalizedName({
      messageFile: '/path/to/non-existent-dir/messages.json',
      manifestData: manifestWithoutApps,
    })
      .then(makeSureItFails())
      .catch((error) => {
        log.info(error);
        assert.instanceOf(error, UsageError);
        assert.match(
          error.message,
          /Error .* file .*messages\.json: .*: no such file or directory/);
      });
  });

  it('can build an extension without an ID', () => {
    return withTempDir(
      (tmpDir) => {
        // Make sure a manifest without an ID doesn't throw an error.
        return build({
          sourceDir: fixturePath('minimal-web-ext'),
          manifestData: manifestWithoutApps,
          artifactsDir: tmpDir.path(),
        });
      }
    );
  });

  it('prepares the artifacts dir', () => withTempDir(
    (tmpDir) => {
      const artifactsDir = path.join(tmpDir.path(), 'artifacts');
      return build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir,
      })
        .then(() => fs.stat(artifactsDir))
        .then((stats) => {
          assert.equal(stats.isDirectory(), true);
        });
    }
  ));

  it('lets you specify a manifest', () => withTempDir(
    (tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
      }, {
        manifestData: basicManifest,
      })
        .then((buildResult) => {
          assert.match(buildResult.extensionPath,
                       /the_extension-0\.0\.1\.zip$/);
          return buildResult.extensionPath;
        })
  ));

  it('asks FileFilter what files to include in the ZIP', () => {
    let zipFile = new ZipFile();
    let fileFilter = new FileFilter({
      filesToIgnore: ['**/background-script.js'],
    });

    return withTempDir(
      (tmpDir) =>
        build({
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir: tmpDir.path(),
        }, {fileFilter})
          .then((buildResult) => zipFile.open(buildResult.extensionPath))
          .then(() => zipFile.extractFilenames())
          .then((fileNames) => {
            assert.notInclude(fileNames, 'background-script.js');
          })
    );
  });

  it('lets you rebuild when files change', () => withTempDir(
    (tmpDir) => {
      const fileFilter = new FileFilter();
      sinon.spy(fileFilter, 'wantFile');
      const onSourceChange = sinon.spy(() => {});
      const sourceDir = fixturePath('minimal-web-ext');
      const artifactsDir = tmpDir.path();
      return build({
        sourceDir, artifactsDir, asNeeded: true,
      }, {
        manifestData: basicManifest, onSourceChange, fileFilter,
      })
        .then((buildResult) => {
          // Make sure we still have a build result.
          assert.match(buildResult.extensionPath, /\.zip$/);
          return buildResult;
        })
        .then((buildResult) => {
          assert.equal(onSourceChange.called, true);
          const args = onSourceChange.firstCall.args[0];
          assert.equal(args.sourceDir, sourceDir);
          assert.equal(args.artifactsDir, artifactsDir);
          assert.typeOf(args.onChange, 'function');

          // Make sure it uses the file filter.
          assert.typeOf(args.shouldWatchFile, 'function');
          args.shouldWatchFile('/some/path');
          assert.equal(fileFilter.wantFile.called, true);

          // Remove the built extension.
          return fs.unlink(buildResult.extensionPath)
            // Execute the onChange handler to make sure it gets built
            // again. This simulates what happens when the file watcher
            // executes the callback.
            .then(() => args.onChange());
        })
        .then((buildResult) => {
          assert.match(buildResult.extensionPath, /\.zip$/);
          return fs.stat(buildResult.extensionPath);
        })
        .then((stat) => {
          assert.equal(stat.isFile(), true);
        });
    }
  ));

  it('throws errors when rebuilding in source watcher', () => withTempDir(
    (tmpDir) => {
      var packageResult = Promise.resolve({});
      const packageCreator = sinon.spy(() => packageResult);
      const onSourceChange = sinon.spy(() => {});
      return build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        asNeeded: true,
      }, {
        manifestData: basicManifest, onSourceChange, packageCreator,
      })
        .then(() => {
          assert.equal(onSourceChange.called, true);
          assert.equal(packageCreator.callCount, 1);

          const {onChange} = onSourceChange.firstCall.args[0];
          packageResult = Promise.reject(new Error(
            'Simulate an error on the second call to packageCreator()'));
          // Invoke the stub packageCreator() again which should throw an error
          return onChange();
        })
        .then(makeSureItFails())
        .catch((error) => {
          assert.include(
            error.message,
            'Simulate an error on the second call to packageCreator()');
        });
    }
  ));

  describe('safeFileName', () => {

    it('makes names safe for writing to a file system', () => {
      assert.equal(safeFileName('Bob Loblaw\'s 2005 law-blog.net'),
                   'bob_loblaw_s_2005_law-blog.net');
    });

  });

  describe('FileFilter', () => {
    const defaultFilter = new FileFilter();

    it('ignores long XPI paths by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/some.xpi'), false);
    });

    it('ignores short XPI paths by default', () => {
      assert.equal(defaultFilter.wantFile('some.xpi'), false);
    });

    it('ignores .git directories by default', () => {
      assert.equal(defaultFilter.wantFile('.git'), false);
    });

    it('ignores nested .git directories by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/.git'), false);
    });

    it('ignores any hidden file by default', () => {
      assert.equal(defaultFilter.wantFile('.whatever'), false);
    });

    it('ignores ZPI paths by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/some.zip'), false);
    });

    it('allows other files', () => {
      assert.equal(defaultFilter.wantFile('manifest.json'), true);
    });

    it('allows you to override the defaults', () => {
      const filter = new FileFilter({
        filesToIgnore: ['manifest.json'],
      });
      assert.equal(filter.wantFile('some.xpi'), true);
      assert.equal(filter.wantFile('manifest.json'), false);
    });

    it('ignores node_modules by default', () => {
      assert.equal(defaultFilter.wantFile('path/to/node_modules'), false);
    });

  });

});

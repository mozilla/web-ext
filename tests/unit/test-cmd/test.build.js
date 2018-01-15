/* @flow */
import path from 'path';

import {fs} from 'mz';
import {it, describe} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';
import defaultEventToPromise from 'event-to-promise';

import build, {
  safeFileName,
  getDefaultLocalizedName,
  defaultPackageCreator,
} from '../../../src/cmd/build';
import {FileFilter} from '../../../src/util/file-filter';
import {withTempDir} from '../../../src/util/temp-dir';
import {
  basicManifest,
  fixturePath,
  makeSureItFails,
  ZipFile,
} from '../helpers';
import {manifestWithoutApps} from '../test-util/test.manifest';
import {UsageError} from '../../../src/errors';
import {createLogger} from '../../../src/util/logger';

const log = createLogger(__filename);

describe('build', () => {

  it('zips a package', () => withTempDir(
    async (tmpDir) => {
      const zipFile = new ZipFile();
      const buildResult = await build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
      });
      assert.match(buildResult.extensionPath,
                   /minimal_extension-1\.0\.zip$/);
      await zipFile.open(buildResult.extensionPath);
      const fileNames = await zipFile.extractFilenames();
      fileNames.sort();
      assert.deepEqual(fileNames, ['background-script.js', 'manifest.json']);
      await zipFile.close();
    }
  ));

  it('configures a build command with the expected fileFilter', async () => {
    const packageCreator = sinon.spy(
      () => ({extensionPath: 'extension/path'})
    );
    const fileFilter = {wantFile: () => true};
    const createFileFilter = sinon.spy(() => fileFilter);
    const params = {
      sourceDir: '/src',
      artifactsDir: 'artifacts',
      ignoreFiles: ['**/*.log'],
    };
    await build(params, {packageCreator, createFileFilter});
    // ensure sourceDir, artifactsDir, ignoreFiles is used
    sinon.assert.calledWithMatch(createFileFilter, params);
    // ensure packageCreator received correct fileFilter
    sinon.assert.calledWithMatch(packageCreator, {fileFilter});
  });

  it('gives the correct name to a localized extension', () => withTempDir(
    async (tmpDir) => {
      const buildResult = await build({
        sourceDir: fixturePath('minimal-localizable-web-ext'),
        artifactsDir: tmpDir.path(),
      });
      assert.match(buildResult.extensionPath,
                   /name_of_the_extension-1\.0\.zip$/);
    }
  ));

  it('handles repeating localization keys', () => withTempDir(
    async (tmpDir) => {
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      await fs.writeFile(
        messageFileName,
        `{"extensionName": {
            "message": "example extension",
            "description": "example description"
          }
        }`
      );

      const manifestWithRepeatingPattern = {
        name: '__MSG_extensionName__ __MSG_extensionName__',
        version: '0.0.1',
      };

      const result = await getDefaultLocalizedName({
        messageFile: messageFileName,
        manifestData: manifestWithRepeatingPattern,
      });
      assert.match(result, /example extension example extension/);
    }
  ));

  it('checks locale file for malformed json', () => withTempDir(
    async (tmpDir) => {
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      await fs.writeFile(messageFileName, '{"simulated:" "json syntax error"');
      try {
        await getDefaultLocalizedName({
          messageFile: messageFileName,
          manifestData: manifestWithoutApps,
        });
        makeSureItFails();
      } catch (error) {
        assert.instanceOf(error, UsageError);
        assert.match(error.message, /Unexpected string in JSON at position 14/);
        assert.match(error.message, /^Error parsing messages.json/);
        assert.include(error.message, messageFileName);
      }
    }
  ));

  it('checks locale file for incorrect format', () => withTempDir(
    async (tmpDir) => {
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      //This is missing the 'message' key
      await fs.writeFile(
        messageFileName,
        `{"extensionName": {
            "description": "example extension"
            }
        }`
      );
      const basicLocalizedManifest = {
        name: '__MSG_extensionName__',
        version: '0.0.1',
      };
      try {
        await getDefaultLocalizedName({
          messageFile: messageFileName,
          manifestData: basicLocalizedManifest,
        });
        makeSureItFails();
      } catch (error) {
        assert.instanceOf(error, UsageError);
        assert.match(
          error.message,
          /The locale file .*messages\.json is missing key: extensionName/);
      }
    }
  ));

  it('throws an error if the locale file does not exist', async () => {
    try {
      await getDefaultLocalizedName({
        messageFile: '/path/to/non-existent-dir/messages.json',
        manifestData: manifestWithoutApps,
      });
      makeSureItFails();
    } catch (error) {
      log.info(error);
      assert.instanceOf(error, UsageError);
      assert.match(
        error.message,
        /Error: ENOENT: no such file or directory, open .*messages.json/);
      assert.match(error.message, /^Error reading messages.json/);
      assert.include(error.message, '/path/to/non-existent-dir/messages.json');
    }
  });

  it('can build an extension without an ID', () => withTempDir(
    async (tmpDir) => {
      // Make sure a manifest without an ID doesn't throw an error.
      await build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
      }, {manifestData: manifestWithoutApps});
    }
  ));

  it('prepares the artifacts dir', () => withTempDir(
    async (tmpDir) => {
      const artifactsDir = path.join(tmpDir.path(), 'artifacts');
      await build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir,
      });
      const stats = await fs.stat(artifactsDir);
      assert.equal(stats.isDirectory(), true);
    }
  ));

  it('lets you specify a manifest', () => withTempDir(
    async (tmpDir) => {
      const buildResult = await build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
      }, {
        manifestData: basicManifest,
      });
      assert.match(
        buildResult.extensionPath,
        /the_extension-0\.0\.1\.zip$/);
    }
  ));

  it('asks FileFilter what files to include in the ZIP', () => withTempDir(
    async (tmpDir) => {
      const zipFile = new ZipFile();
      const fileFilter = new FileFilter({
        sourceDir: '.',
        baseIgnoredPatterns: ['**/background-script.js'],
      });
      const buildResult = await build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
      }, {fileFilter});
      await zipFile.open(buildResult.extensionPath);
      const fileNames = await zipFile.extractFilenames();
      assert.notInclude(fileNames, 'background-script.js');
      await zipFile.close();
    }
  ));

  it('lets you rebuild when files change', () => withTempDir(
    async (tmpDir) => {
      const sourceDir = fixturePath('minimal-web-ext');
      const artifactsDir = tmpDir.path();
      const fileFilter = new FileFilter({sourceDir, artifactsDir});
      sinon.spy(fileFilter, 'wantFile');
      const onSourceChange = sinon.spy(() => {});
      const buildResult = await build({
        sourceDir, artifactsDir, asNeeded: true,
      }, {
        manifestData: basicManifest, onSourceChange, fileFilter,
      });
      // Make sure we still have a build result.
      assert.match(buildResult.extensionPath, /\.zip$/);
      sinon.assert.called(onSourceChange);
      const args = onSourceChange.firstCall.args[0];
      assert.equal(args.sourceDir, sourceDir);
      assert.equal(args.artifactsDir, artifactsDir);
      assert.typeOf(args.onChange, 'function');

      // Make sure it uses the file filter.
      assert.typeOf(args.shouldWatchFile, 'function');
      args.shouldWatchFile('/some/path');
      assert.equal(fileFilter.wantFile.called, true);

      // Remove the built extension.
      await fs.unlink(buildResult.extensionPath);
      // Execute the onChange handler to make sure it gets built
      // again. This simulates what happens when the file watcher
      // executes the callback.
      await args.onChange();
      assert.match(buildResult.extensionPath, /\.zip$/);
      const stat = await fs.stat(buildResult.extensionPath);
      assert.equal(stat.isFile(), true);
    }
  ));

  it('throws errors when rebuilding in source watcher', () => withTempDir(
    async (tmpDir) => {
      var packageResult = Promise.resolve({});
      const packageCreator = sinon.spy(() => packageResult);
      const onSourceChange = sinon.spy(() => {});
      await build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        asNeeded: true,
      }, {
        manifestData: basicManifest, onSourceChange, packageCreator,
      });
      sinon.assert.called(onSourceChange);
      assert.equal(packageCreator.callCount, 1);

      const {onChange} = onSourceChange.firstCall.args[0];
      packageResult = Promise.reject(new Error(
        'Simulate an error on the second call to packageCreator()'));
      // Invoke the stub packageCreator() again which should throw an error
      try {
        onChange();
        makeSureItFails();
      } catch (error) {
        assert.include(
          error && error.message,
          'Simulate an error on the second call to packageCreator()');
      }
    }
  ));

  it('raises an UsageError if zip file exists', () => withTempDir(
    async (tmpDir) => {
      const testFileName = path.join(tmpDir.path(),
                                     'minimal_extension-1.0.zip');
      await fs.writeFile(testFileName, 'test');
      try {
        await build({
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir: tmpDir.path(),
        });
        makeSureItFails();
      } catch (error) {
        assert.instanceOf(error, UsageError);
        assert.match(error.message, /Extension exists at the destination path/);
      }
    }
  ));

  it('overwrites zip file if it exists', () => withTempDir(
    async (tmpDir) => {
      const testFileName = path.join(tmpDir.path(),
                                     'minimal_extension-1.0.zip');
      await fs.writeFile(testFileName, 'test');
      const buildResult = await build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        overwriteDest: true,
      });
      assert.match(buildResult.extensionPath, /minimal_extension-1\.0\.zip$/);
    }
  ));

  describe('safeFileName', () => {

    it('makes names safe for writing to a file system', () => {
      assert.equal(safeFileName('Bob Loblaw\'s 2005 law-blog.net'),
                   'bob_loblaw_s_2005_law-blog.net');
    });

  });

  describe('defaultPackageCreator', () => {
    it('should reject on Unexpected errors', () => withTempDir(
      async (tmpDir) => {
        const fakeEventToPromise = sinon.spy(async (stream) => {
          await defaultEventToPromise(stream, 'close');
          // Remove contents of tmpDir before removal of directory.
          const files = await fs.readdir(tmpDir.path());
          for (const file of files) {
            await fs.unlink(path.join(tmpDir.path(), file));
          }
          return Promise.reject(new Error('Unexpected error'));
        });
        const sourceDir = fixturePath('minimal-web-ext');
        const artifactsDir = tmpDir.path();
        const fileFilter = new FileFilter({sourceDir, artifactsDir});
        const params = {
          manifestData: basicManifest,
          sourceDir,
          fileFilter,
          artifactsDir,
          overwriteDest: false,
          showReadyMessage: false,
        };
        const options = {
          eventToPromise: fakeEventToPromise,
        };

        try {
          await defaultPackageCreator(params, options);
          makeSureItFails();
        } catch (error) {
          assert.match(error.message, /Unexpected error/);
        }
      }
    ));

  });

});

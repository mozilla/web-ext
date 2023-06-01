import path from 'path';

import { fs } from 'mz';
import { it, describe } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';
import * as promiseToolbox from 'promise-toolbox';

import build, {
  safeFileName,
  getDefaultLocalizedName,
  getStringPropertyValue,
  defaultPackageCreator,
} from '../../../src/cmd/build.js';
import { FileFilter } from '../../../src/util/file-filter.js';
import { withTempDir } from '../../../src/util/temp-dir.js';
import {
  basicManifest,
  fixturePath,
  makeSureItFails,
  manifestWithoutApps,
  ZipFile,
} from '../helpers.js';
import { UsageError } from '../../../src/errors.js';
import { createLogger } from '../../../src/util/logger.js';

const { pFromEvent: defaultFromEvent } = promiseToolbox;

const log = createLogger(import.meta.url);

describe('build', () => {
  it('zips a package', () => {
    const zipFile = new ZipFile();

    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
      })
        .then((buildResult) => {
          assert.match(
            buildResult.extensionPath,
            /minimal_extension-1\.0\.zip$/
          );
          return buildResult.extensionPath;
        })
        .then((extensionPath) => zipFile.open(extensionPath))
        .then(() => zipFile.extractFilenames())
        .then((fileNames) => {
          fileNames.sort();
          assert.deepEqual(fileNames, [
            'background-script.js',
            'manifest.json',
          ]);
          return zipFile.close();
        })
    );
  });

  it('configures a build command with the expected fileFilter', () => {
    const packageCreator = sinon.spy(() => ({
      extensionPath: 'extension/path',
    }));
    const fileFilter = { wantFile: () => true };
    const createFileFilter = sinon.spy(() => fileFilter);
    const params = {
      sourceDir: '/src',
      artifactsDir: 'artifacts',
      ignoreFiles: ['**/*.log'],
    };
    return build(params, { packageCreator, createFileFilter }).then(() => {
      // ensure sourceDir, artifactsDir, ignoreFiles is used
      sinon.assert.calledWithMatch(createFileFilter, params);
      // ensure packageCreator received correct fileFilter
      sinon.assert.calledWithMatch(packageCreator, { fileFilter });
    });
  });

  it('throws on missing manifest properties in filename template', () => {
    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        filename: '{missingKey}-{version}.xpi',
      })
        .then(makeSureItFails())
        .catch((error) => {
          log.info(error);
          assert.instanceOf(error, UsageError);
          assert.match(error.message, /Manifest key "missingKey" is missing/);
        })
    );
  });

  it('gives the correct custom name to an extension', () => {
    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        filename: '{applications.gecko.id}-{version}.xpi',
      }).then((buildResult) => {
        assert.match(
          path.basename(buildResult.extensionPath),
          /minimal-example_web-ext-test-suite-1.0\.xpi$/
        );
      })
    );
  });

  it('gives the correct name to a localized extension', () => {
    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-localizable-web-ext'),
        artifactsDir: tmpDir.path(),
      }).then((buildResult) => {
        assert.match(
          buildResult.extensionPath,
          /name_of_the_extension-1\.0\.zip$/
        );
      })
    );
  });

  it('sanitizes characters in extension name in filename from template', () => {
    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('slashed-name'),
        artifactsDir: tmpDir.path(),
        // name contains a slash. description ends with ".zip".
        filename: 'prefix-{name}{description}',
      }).then((buildResult) => {
        assert.match(
          buildResult.extensionPath,
          /prefix-name_w_o_slash_o_ends_with\.zip$/
        );
      })
    );
  });

  it('throws an error if the filename contains a path', () => {
    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        filename: 'foo/{version}.xpi',
      })
        .then(makeSureItFails())
        .catch((error) => {
          log.info(error);
          assert.instanceOf(error, UsageError);
          assert.match(
            error.message,
            /Filename "foo\/1.0.xpi" should not contain a path/
          );
        })
    );
  });

  it("throws an error if the filename doesn't end in .xpi or .zip", () => {
    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        filename: '{version}.unknown-ext',
      })
        .then(makeSureItFails())
        .catch((error) => {
          log.info(error);
          assert.instanceOf(error, UsageError);
          assert.match(
            error.message,
            /Filename "1.0.unknown-ext" should have a zip or xpi extension/
          );
        })
    );
  });

  it('accept a dash in the default_locale field', () => {
    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('dashed-locale'),
        artifactsDir: tmpDir.path(),
      }).then((buildResult) => {
        assert.match(
          buildResult.extensionPath,
          /extension_with_dashed_locale-1\.0\.zip$/
        );
      })
    );
  });

  it('handles repeating localization keys', () => {
    return withTempDir((tmpDir) => {
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      fs.writeFileSync(
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

      return getDefaultLocalizedName({
        messageFile: messageFileName,
        manifestData: manifestWithRepeatingPattern,
      }).then((result) => {
        assert.match(result, /example extension example extension/);
      });
    });
  });

  it('handles UTF-8 BOM in messages.json', () =>
    withTempDir(async (tmpDir) => {
      const manifestDataWithBOM = '\uFEFF{"name":{"message":"BOM = \uFEFF!"}}';
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      await fs.writeFile(messageFileName, manifestDataWithBOM);
      const result = await getDefaultLocalizedName({
        messageFile: messageFileName,
        manifestData: {
          name: '__MSG_name__',
          version: '0.0.1',
        },
      });
      assert.equal(result, 'BOM = \uFEFF!');
    }));

  it('handles comments in messages.json', () => {
    return withTempDir((tmpDir) => {
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      fs.writeFileSync(
        messageFileName,
        `{"extensionName": {
              "message": "example extension", // comments
              "description": "example with comments"
            }
          }`
      );

      return getDefaultLocalizedName({
        messageFile: messageFileName,
        manifestData: {
          name: '__MSG_extensionName__',
          version: '0.0.1',
        },
      }).then((result) => {
        assert.match(result, /example extension/);
      });
    });
  });

  it('checks locale file for malformed json', () => {
    return withTempDir((tmpDir) => {
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      fs.writeFileSync(messageFileName, '{"simulated:" "json syntax error"');

      return getDefaultLocalizedName({
        messageFile: messageFileName,
        manifestData: manifestWithoutApps,
      })
        .then(makeSureItFails())
        .catch((error) => {
          assert.instanceOf(error, UsageError);
          // Matching error messages from either Node.js < 19 or Node.js >= 19
          // Node.js 19.0 includes V8 10.7 [1], and the latter includes changes to make JSON.parse errors user-friendly
          // [1] https://github.com/nodejs/node/pull/44741
          // [2] https://chromium-review.googlesource.com/c/v8/v8/+/3513684
          // [3] https://chromium-review.googlesource.com/c/v8/v8/+/3652254
          assert.match(
            error.message,
            /Unexpected string in JSON at position 14|Expected ':' after property name in JSON at position 14/
          );
          assert.match(error.message, /^Error parsing messages\.json/);
          assert.include(error.message, messageFileName);
        });
    });
  });

  it('checks locale file for incorrect format', () => {
    return withTempDir((tmpDir) => {
      const messageFileName = path.join(tmpDir.path(), 'messages.json');
      //This is missing the 'message' key
      fs.writeFileSync(
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
      return getDefaultLocalizedName({
        messageFile: messageFileName,
        manifestData: basicLocalizedManifest,
      })
        .then(makeSureItFails())
        .catch((error) => {
          assert.instanceOf(error, UsageError);
          assert.match(
            error.message,
            /The locale file .*messages\.json is missing key: extensionName/
          );
        });
    });
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
          /Error: ENOENT: no such file or directory, open .*messages.json/
        );
        assert.match(error.message, /^Error reading messages.json/);
        assert.include(
          error.message,
          '/path/to/non-existent-dir/messages.json'
        );
      });
  });

  it('can build an extension without an ID', () => {
    return withTempDir((tmpDir) => {
      // Make sure a manifest without an ID doesn't throw an error.
      return build(
        {
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir: tmpDir.path(),
        },
        { manifestData: manifestWithoutApps }
      );
    });
  });

  it('prepares the artifacts dir', () =>
    withTempDir((tmpDir) => {
      const artifactsDir = path.join(tmpDir.path(), 'artifacts');
      return build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir,
      })
        .then(() => fs.stat(artifactsDir))
        .then((stats) => {
          assert.equal(stats.isDirectory(), true);
        });
    }));

  it('lets you specify a manifest', () =>
    withTempDir((tmpDir) =>
      build(
        {
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir: tmpDir.path(),
        },
        {
          manifestData: basicManifest,
        }
      ).then((buildResult) => {
        assert.match(buildResult.extensionPath, /the_extension-0\.0\.1\.zip$/);
        return buildResult.extensionPath;
      })
    ));

  it('asks FileFilter what files to include in the ZIP', () => {
    const zipFile = new ZipFile();
    const fileFilter = new FileFilter({
      sourceDir: '.',
      baseIgnoredPatterns: ['**/background-script.js'],
    });

    return withTempDir((tmpDir) =>
      build(
        {
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir: tmpDir.path(),
        },
        { fileFilter }
      )
        .then((buildResult) => zipFile.open(buildResult.extensionPath))
        .then(() => zipFile.extractFilenames())
        .then((fileNames) => {
          assert.notInclude(fileNames, 'background-script.js');
          return zipFile.close();
        })
    );
  });

  it('lets you rebuild when files change', () =>
    withTempDir((tmpDir) => {
      const sourceDir = fixturePath('minimal-web-ext');
      const artifactsDir = tmpDir.path();
      const fileFilter = new FileFilter({ sourceDir, artifactsDir });
      sinon.spy(fileFilter, 'wantFile');
      const onSourceChange = sinon.spy(() => {});
      return build(
        {
          sourceDir,
          artifactsDir,
          asNeeded: true,
        },
        {
          manifestData: basicManifest,
          onSourceChange,
          fileFilter,
        }
      )
        .then((buildResult) => {
          // Make sure we still have a build result.
          assert.match(buildResult.extensionPath, /\.zip$/);
          return buildResult;
        })
        .then((buildResult) => {
          const args = onSourceChange.firstCall.args[0];

          sinon.assert.called(onSourceChange);
          sinon.assert.calledWithMatch(onSourceChange, {
            artifactsDir,
            sourceDir,
          });

          assert.typeOf(args.onChange, 'function');

          // Make sure it uses the file filter.
          assert.typeOf(args.shouldWatchFile, 'function');
          args.shouldWatchFile('/some/path');
          sinon.assert.called(fileFilter.wantFile);

          // Remove the built extension.
          return (
            fs
              .unlink(buildResult.extensionPath)
              // Execute the onChange handler to make sure it gets built
              // again. This simulates what happens when the file watcher
              // executes the callback.
              .then(() => args.onChange())
          );
        })
        .then((buildResult) => {
          assert.match(buildResult.extensionPath, /\.zip$/);
          return fs.stat(buildResult.extensionPath);
        })
        .then((stat) => {
          assert.equal(stat.isFile(), true);
        });
    }));

  it('throws errors when rebuilding in source watcher', () =>
    withTempDir((tmpDir) => {
      var packageResult = Promise.resolve({});
      const packageCreator = sinon.spy(() => packageResult);
      const onSourceChange = sinon.spy(() => {});
      return build(
        {
          sourceDir: fixturePath('minimal-web-ext'),
          artifactsDir: tmpDir.path(),
          asNeeded: true,
        },
        {
          manifestData: basicManifest,
          onSourceChange,
          packageCreator,
        }
      )
        .then(() => {
          sinon.assert.called(onSourceChange);
          sinon.assert.calledOnce(packageCreator);
          const { onChange } = onSourceChange.firstCall.args[0];
          packageResult = Promise.reject(
            new Error(
              'Simulate an error on the second call to packageCreator()'
            )
          );
          // Invoke the stub packageCreator() again which should throw an error
          return onChange();
        })
        .then(makeSureItFails())
        .catch((error) => {
          assert.include(
            error.message,
            'Simulate an error on the second call to packageCreator()'
          );
        });
    }));

  it('raises an UsageError if zip file exists', () => {
    return withTempDir((tmpDir) => {
      const testFileName = path.join(
        tmpDir.path(),
        'minimal_extension-1.0.zip'
      );
      return fs
        .writeFile(testFileName, 'test')
        .then(() =>
          build({
            sourceDir: fixturePath('minimal-web-ext'),
            artifactsDir: tmpDir.path(),
          })
        )
        .catch((error) => {
          assert.instanceOf(error, UsageError);
          assert.match(
            error.message,
            /Extension exists at the destination path/
          );
        });
    });
  });

  it('overwrites zip file if it exists', () => {
    return withTempDir((tmpDir) => {
      const testFileName = path.join(
        tmpDir.path(),
        'minimal_extension-1.0.zip'
      );
      return fs
        .writeFile(testFileName, 'test')
        .then(() =>
          build({
            sourceDir: fixturePath('minimal-web-ext'),
            artifactsDir: tmpDir.path(),
            overwriteDest: true,
          })
        )
        .then((buildResult) => {
          assert.match(
            buildResult.extensionPath,
            /minimal_extension-1\.0\.zip$/
          );
        });
    });
  });

  it('zips a package and includes a file from a negated filter', () => {
    const zipFile = new ZipFile();

    return withTempDir((tmpDir) =>
      build({
        sourceDir: fixturePath('minimal-web-ext'),
        artifactsDir: tmpDir.path(),
        ignoreFiles: [
          '!node_modules',
          '!node_modules/pkg1',
          '!node_modules/pkg1/**',
        ],
      })
        .then((buildResult) => {
          assert.match(
            buildResult.extensionPath,
            /minimal_extension-1\.0\.zip$/
          );
          return buildResult.extensionPath;
        })
        .then((extensionPath) => zipFile.open(extensionPath))
        .then(() => zipFile.extractFilenames())
        .then((fileNames) => {
          fileNames.sort();
          assert.deepEqual(fileNames, [
            'background-script.js',
            'manifest.json',
            'node_modules/',
            'node_modules/pkg1/',
            'node_modules/pkg1/file1.txt',
          ]);
          return zipFile.close();
        })
    );
  });

  describe('safeFileName', () => {
    it('makes names safe for writing to a file system', () => {
      assert.equal(
        safeFileName("Bob Loblaw's 2005 law-blog.net"),
        'bob_loblaw_s_2005_law-blog.net'
      );
    });
  });

  describe('defaultPackageCreator', () => {
    it('should reject on Unexpected errors', () => {
      return withTempDir((tmpDir) => {
        const fakeFromEvent = sinon.spy(async (stream) => {
          await defaultFromEvent(stream, 'close');
          // Remove contents of tmpDir before removal of directory.
          const files = await fs.readdir(tmpDir.path());
          for (const file of files) {
            await fs.unlink(path.join(tmpDir.path(), file));
          }
          return Promise.reject(new Error('Unexpected error'));
        });
        const sourceDir = fixturePath('minimal-web-ext');
        const artifactsDir = tmpDir.path();
        const fileFilter = new FileFilter({ sourceDir, artifactsDir });
        const params = {
          manifestData: basicManifest,
          sourceDir,
          fileFilter,
          artifactsDir,
          overwriteDest: false,
          showReadyMessage: false,
        };
        const options = {
          fromEvent: fakeFromEvent,
        };

        return defaultPackageCreator(params, options)
          .then(makeSureItFails())
          .catch((error) => {
            assert.match(error.message, /Unexpected error/);
          });
      });
    });
  });

  describe('getStringPropertyValue', () => {
    it('accepts the value 0', () => {
      assert.equal(getStringPropertyValue('foo', { foo: 0 }), '0');
    });

    it('throws an error if string value is empty', () => {
      assert.throws(
        () => getStringPropertyValue('foo', { foo: '' }),
        UsageError,
        /Manifest key "foo" value is an empty string/
      );
    });
  });
});

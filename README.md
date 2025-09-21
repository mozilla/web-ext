# Web-ext

This is a command line tool to help build, run, and test
[WebExtensions](https://wiki.mozilla.org/WebExtensions).

[![CircleCI](https://circleci.com/gh/mozilla/web-ext.svg?style=svg)](https://circleci.com/gh/mozilla/web-ext)
[![codecov](https://codecov.io/gh/mozilla/web-ext/branch/master/graph/badge.svg)](https://codecov.io/gh/mozilla/web-ext)
[![npm version](https://badge.fury.io/js/web-ext.svg)](https://badge.fury.io/js/web-ext)

Ultimately, it aims to support browser extensions in a standard, portable,
cross-platform way. Initially, it will provide a streamlined experience for developing
[Firefox Extensions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

## Documentation

- [Getting started with web-ext][web-ext-user-docs]
- [Command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)

Here are the commands you can run. Click on each one for detailed documentation or use `--help` on the command line, such as `web-ext build --help`.

- [`run`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-run)
  - Run the extension
- [`lint`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-lint)
  - Validate the extension source
- [`sign`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign)
  - Sign the extension so it can be installed in Firefox
- [`build`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-build)
  - Create an extension package from source
- [`docs`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-docs)
  - Open the `web-ext` documentation in a browser

## Installation

### Using npm

First, make sure you are running the current
[LTS](https://github.com/nodejs/LTS)
(long term support) version of
[NodeJS](https://nodejs.org/en/).

#### Global command

You can install this command onto your machine globally with:

    npm install --global web-ext

#### For your project

Alternatively, you can install this command as one of the
[`devDependencies`](https://docs.npmjs.com/files/package.json#devdependencies)
of your project. This method can help you control the version of `web-ext`
as used by your team.

    npm install --save-dev web-ext

Next you can use the `web-ext` command in your project as an
[npm script](https://docs.npmjs.com/misc/scripts).
Here is an example where the `--source-dir` argument specifies where to find
the source code for your extension.

`package.json`

```json
"scripts": {
  "start:firefox": "web-ext run --source-dir ./extension-dist/",
}
```

You can always pass in additional commands to your npm scripts using
the `--` suffix. For example, the previous script could specify the Firefox
version on the command line with this:

    npm run start:firefox -- --firefox=nightly

### Using Homebrew (unofficial)

The community maintains a `web-ext` formula.

```sh
brew install web-ext
```

## Installation from source

You'll need:

- [Node.js](https://nodejs.org/en/) (current [LTS](https://github.com/nodejs/LTS))
- [npm](https://www.npmjs.com/), 8.0.0 or higher is recommended

Optionally, you may like:

- [nvm](https://github.com/creationix/nvm), which helps manage node versions

If you had already installed `web-ext` from npm,
you may need to uninstall it first:

    npm uninstall --global web-ext

Change into the source and install all dependencies:

    git clone https://github.com/mozilla/web-ext.git
    cd web-ext
    npm ci

Build the command:

    npm run build

Link it to your node installation:

    npm link

You can now run it from any directory:

    web-ext --help

To get updates, just pull changes and rebuild the executable. You don't
need to relink it.

    cd /path/to/web-ext
    git pull
    npm run build

## Using web-ext in NodeJS code

**Note:** web-ext is primarily a command line tool and there is limited support for direct use of its internal API. Backward incompatible changes
may be introduced in minor and patch version updates to the web-ext npm package.

Aside from [using web-ext on the command line][web-ext-user-docs], you may wish to execute `web-ext` in NodeJS code.

As of version `7.0.0`, the `web-ext` npm package exports NodeJS native ES modules only. If you are using CommonJS, you will have to use [dynamic imports][dynamic-imports].

### Examples

You are able to execute command functions without any argument validation. If you want to execute `web-ext run` you would do so like this:

```js
import webExt from 'web-ext';

webExt.cmd
  .run(
    {
      // These are command options derived from their CLI conterpart.
      // In this example, --source-dir is specified as sourceDir.
      firefox: '/path/to/Firefox-executable',
      sourceDir: '/path/to/your/extension/source/',
    },
    {
      // These are non CLI related options for each function.
      // You need to specify this one so that your NodeJS application
      // can continue running after web-ext is finished.
      shouldExitProgram: false,
    },
  )
  .then((extensionRunner) => {
    // The command has finished. Each command resolves its
    // promise with a different value.
    console.log(extensionRunner);
    // You can do a few things like:
    // extensionRunner.reloadAllExtensions();
    // extensionRunner.exit();
  });
```

If you would like to run an extension on Firefox for Android:

```js
import * as adbUtils from "web-ext/util/adb";

// Path to adb binary (optional parameter, auto-detected if missing)
const adbBin = "/path/to/adb";
// Get an array of device ids (Array<string>)
const deviceIds = await adbUtils.listADBDevices(adbBin);
const adbDevice = ...
// Get an array of Firefox APKs (Array<string>)
const firefoxAPKs = await adbUtils.listADBFirefoxAPKs(
  deviceId, adbBin
);
const firefoxApk = ...

webExt.cmd.run({
  target: 'firefox-android',
  firefoxApk,
  adbDevice,
  sourceDir: ...
}).then((extensionRunner) => {...});
```

If you would like to control logging, you can access the logger object. Here is an example of turning on verbose logging:

```js
import * as webExtLogger from 'web-ext/util/logger';

webExtLogger.consoleStream.makeVerbose();
webExt.cmd.run({ sourceDir: './src' }, { shouldExitProgram: false });
```

You can also disable the use of standard input:

```js
webExt.cmd.run({ noInput: true }, { shouldExitProgram: false });
```

`web-ext` is designed for WebExtensions but you can try disabling manifest validation to work with legacy extensions. This is not officially supported.

```js
webExt.cmd.run(
  { sourceDir: './src' },
  {
    getValidatedManifest: () => ({
      name: 'some-fake-name',
      version: '1.0.0',
    }),
    shouldExitProgram: false,
  },
);
```

You can also use `webExt.cmd.sign()` to request a signed xpi for a given extension source directory:

```js
webExt.cmd.sign({
  // NOTE: Please set userAgentString to a custom one of your choice.
  userAgentString: 'YOUR-CUSTOM-USERAGENT',
  apiKey,
  apiSecret,
  amoBaseUrl: 'https://addons.mozilla.org/api/v5/',
  sourceDir: ...,
  channel: 'unlisted',
  ...
});
```

You can also access the internal signing module directly if you need to submit an xpi file without also building it.
**Note:** submit-addon is internal web-ext module, using the webExt.cmd.sign() is the recommended API method.

```js
import { signAddon } from 'web-ext/util/submit-addon';

signAddon({
  // NOTE: Please set userAgentString to a custom one of your choice.
  userAgentString: 'YOUR-CUSTOM-USERAGENT',
  apiKey,
  apiSecret,
  amoBaseUrl: 'https://addons.mozilla.org/api/v5/',
  id: 'extension-id@example.com',
  xpiPath: pathToExtension,
  savedUploadUuidPath: '.amo-upload-uuid',
  channel: 'unlisted',
});
```

## Should I Use It?

Yes! The web-ext tool enables you to build and ship extensions for Firefox.
This platform stabilized in
[Firefox 48](https://blog.mozilla.org/addons/2016/04/29/webextensions-in-firefox-48/)
which was released in April of 2016.

## Get Involved

Hi! This tool is under active development. To get involved you can watch the repo,
file issues, create pull requests, or
[contact us](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Contact_us)
to ask a question.
Read the [contributing section](CONTRIBUTING.md) for how to develop new features.

## Some Questions and Answers

### Why do we need a command line tool?

This is a great question and one that we will ask ourselves for each new web-ext
feature. Most WebExtension functionality is baked into the browsers
themselves but a complimentary command line tool will still be helpful.
Here is a partial list of examples:

- File watching.
  - When you edit a file, you may need to trigger certain commands (tests,
    installation, etc).
- Integrating with services.
  - Mozilla offers some useful services such as
    [linting](https://github.com/mozilla/addons-linter) and
    [signing](https://addons-server.readthedocs.io/en/latest/topics/api/v4_frozen/signing.html)
    extensions.

[web-ext-user-docs]: https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/
[dynamic-imports]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports

# Web-ext

This is a command line tool to help build, run, and test
[WebExtensions](https://wiki.mozilla.org/WebExtensions).

[![CircleCI](https://circleci.com/gh/mozilla/web-ext.svg?style=svg)](https://circleci.com/gh/mozilla/web-ext)
[![codecov](https://codecov.io/gh/mozilla/web-ext/branch/master/graph/badge.svg)](https://codecov.io/gh/mozilla/web-ext)
[![Dependency Status](https://david-dm.org/mozilla/web-ext.svg)](https://david-dm.org/mozilla/web-ext)
[![devDependency Status](https://david-dm.org/mozilla/web-ext/dev-status.svg)](https://david-dm.org/mozilla/web-ext#info=devDependencies)
[![npm version](https://badge.fury.io/js/web-ext.svg)](https://badge.fury.io/js/web-ext)

Ultimately, it aims to support browser extensions in a standard, portable,
cross-platform way. Initially, it will provide a streamlined experience for developing
[Firefox Extensions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

## Documentation

* [Getting started with web-ext][web-ext-user-docs]
* [Command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference)

Here are the commands you can run. Click on each one for detailed documentation or use `--help` on the command line, such as `web-ext build --help`.

* [`run`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference#web-ext-run)
  * Run the extension
* [`lint`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference#web-ext-lint)
  * Validate the extension source
* [`sign`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference#web-ext-sign)
  * Sign the extension so it can be installed in Firefox
* [`build`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference#web-ext-build)
  * Create an extension package from source
* [`docs`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference#web-ext-docs)
  * Open the `web-ext` documentation in a browser

## Installation from npm

First, make sure you are running the current
[LTS](https://github.com/nodejs/LTS)
(long term support) version of
[NodeJS](https://nodejs.org/en/).

### Global command

You can install this command onto your machine globally with:

    npm install --global web-ext

### For your project

Alternatively, you can install this command as one of the
[`devDependencies`](https://docs.npmjs.com/files/package.json#devdependencies)
of your project.  This method can help you control the version of `web-ext`
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

## Installation from source

You'll need:
* [Node.js](https://nodejs.org/en/), 10.0.0 or higher
* [npm](https://www.npmjs.com/), 5.6.0 or higher is recommended

Optionally, you may like:
* [nvm](https://github.com/creationix/nvm), which helps manage node versions

If you had already installed `web-ext` from npm,
you may need to uninstall it first:

    npm uninstall --global web-ext

Change into the source and install all dependencies:

    git clone https://github.com/mozilla/web-ext.git
    cd web-ext
    npm install

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

Aside from [using web-ext on the command line][web-ext-user-docs], you may wish to execute `web-ext` in NodeJS code. There is limited support for this. Here are some examples.

You are able to execute command functions without any argument validation. If you want to execute `web-ext run` you would do so like this:

```js
// const webExt = require('web-ext');
// or...
import webExt from 'web-ext';

webExt.cmd.run({
  // These are command options derived from their CLI conterpart.
  // In this example, --source-dir is specified as sourceDir.
  firefox: '/path/to/Firefox-executable',
  sourceDir: '/path/to/your/extension/source/',
}, {
  // These are non CLI related options for each function.
  // You need to specify this one so that your NodeJS application
  // can continue running after web-ext is finished.
  shouldExitProgram: false,
})
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
// Path to adb binary (optional parameter, auto-detected if missing)
const adbBin = "/path/to/adb";
// Get an array of device ids (Array<string>)
const deviceIds = await webExt.util.adb.listADBDevices(adbBin);
const adbDevice = ...
// Get an array of Firefox APKs (Array<string>)
const firefoxAPKs = await webExt.util.adb.listADBFirefoxAPKs(
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
webExt.util.logger.consoleStream.makeVerbose();
webExt.cmd.run({sourceDir: './src'}, {shouldExitProgram: false});
```

You can also disable the use of standard input:

```js
webExt.cmd.run({noInput: true}, {shouldExitProgram: false});
```

`web-ext` is designed for WebExtensions but you can try disabling manifest validation to work with legacy extensions. This is not officially supported.

```js
webExt.cmd.run(
  {sourceDir: './src'},
  {
    getValidatedManifest: () => ({
      name: 'some-fake-name',
      version: '1.0.0',
    }),
    shouldExitProgram: false,
  },
);
```


## Should I Use It?

Yes! The web-ext tool enables you to build and ship extensions for Firefox.
This platform stabilized in
[Firefox 48](https://blog.mozilla.org/addons/2016/04/29/webextensions-in-firefox-48/)
which was released in April of 2016.

## Get Involved

Hi! This tool is under active development. To get involved you can watch the repo,
file issues, create pull requests, or ask a question on
[dev-addons](https://mail.mozilla.org/listinfo/dev-addons).
Read the [contributing section](CONTRIBUTING.md) for how to develop new features.

## Some Questions and Answers

### Why do we need a command line tool?

This is a great question and one that we will ask ourselves for each new web-ext
feature. Most WebExtension functionality is baked into the browsers
themselves but a complimentary command line tool will still be helpful.
Here is a partial list of examples:

* File watching.
  * When you edit a file, you may need to trigger certain commands (tests,
    installation, etc).
* Integrating with services.
  * Mozilla offers some useful services such as
    [linting](https://github.com/mozilla/addons-linter) and
    [signing](https://addons-server.readthedocs.io/en/latest/topics/api/signing.html)
    extensions.

[web-ext-user-docs]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext

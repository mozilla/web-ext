# Web-ext

This is a command line tool to help build, run, and test
[WebExtensions](https://wiki.mozilla.org/WebExtensions).

[![Build Status](https://travis-ci.org/mozilla/web-ext.svg?branch=master)](https://travis-ci.org/mozilla/web-ext)
[![Coverage Status](https://coveralls.io/repos/github/mozilla/web-ext/badge.svg?branch=master)](https://coveralls.io/github/mozilla/web-ext?branch=master)
[![Dependency Status](https://david-dm.org/mozilla/web-ext.svg)](https://david-dm.org/mozilla/web-ext)
[![devDependency Status](https://david-dm.org/mozilla/web-ext/dev-status.svg)](https://david-dm.org/mozilla/web-ext#info=devDependencies)

Ultimately, it aims to support browser extensions in a standard, portable,
cross-platform way. Initially, it will provide a streamlined experience for developing
[Firefox Extensions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

## Documentation

* [Getting started with web-ext][web-ext-user-docs]
* [Command reference](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/web-ext_command_reference)

Here are the commands you can run. Click on each one for detailed documentation or use `--help` on the command line, such as `web-ext build --help`.

* [`run`](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/web-ext_command_reference#web-ext_run)
  * Run the extension
* [`lint`](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/web-ext_command_reference#web-ext_lint)
  * Validate the extension source
* [`sign`](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/web-ext_command_reference#web-ext_sign)
  * Sign the extension so it can be installed in Firefox
* [`build`](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/web-ext_command_reference#web-ext_build)
  * Create an extension package from source
* [`docs`](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/web-ext_command_reference#web-ext_docs)
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
* [Node.js](https://nodejs.org/en/), 6.0.0 or higher
* [npm](https://www.npmjs.com/), 3.0.0 or higher is recommended

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
// const webExt = require('web-ext').default;
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
    [signing](http://olympia.readthedocs.org/en/latest/topics/api/signing.html)
    extensions.

### Why not patch jpm for WebExtensions support?

First, note that [jpm](https://github.com/mozilla-jetpack/jpm/) is still
actively maintained by Mozilla right now.
We decided not to patch jpm for WebExtensions support (See
[jpm issue 445](https://github.com/mozilla-jetpack/jpm/issues/445),
[discussion](https://mail.mozilla.org/pipermail/dev-addons/2015-December/000230.html)).

Mozilla built [cfx](https://developer.mozilla.org/en-US/Add-ons/SDK/Tools/cfx)
then deprecated it for jpm and now we're proposing a new tool.
I know this is frustrating for developers, but WebExtensions mark a major
turning point. It would be an arduous task to wedge its feature set and
simplified development process into jpm.

Pros of creating a new tool:

* By creating a new tool that focuses on the [emerging] WebExtensions standard,
  we have a better chance of interoperating with other platforms, such as
  [Google Chrome](https://developer.chrome.com/extensions) or
  [Opera](https://dev.opera.com/extensions/).
  It would be hard to do that while preserving compatibility in jpm.
* Creating SDK-based add-ons was overly complicated. With WebExtensions you no
  longer need to convert your source into legacy artifacts and you won't need
  boostrapping scripts.
* There are superior features in Firefox now for developing extensions such
  as [loading](https://blog.mozilla.org/addons/2015/12/23/loading-temporary-add-ons/)
  from source code instead of a packaged XPI. It will be
  easier to reimagine a new tool around these work flows rather than
  adjust jpm's existing work flows.
* jpm's functional tests are slow, brittle and hard to run. There are flaky
  time-outs and we've run out of *low hanging fruit* fixes at this point.
* Most of jpm's code was not designed to be unit testable which makes it hard to
  maintain and refactor.
* jpm's code was written in ES5 which is cumbersome after coming from the ES6
  Firefox code base or from most other languages with modern conveniences
  (Python, Ruby, etc).
* Some core functionality of jpm can be extracted and re-used in the new tool.

Cons of creating a new tool:

* Firefox extension developers will have to interrupt and re-arrange their work flows.
* Developers of existing add-ons will need to port to WebExtensions sooner rather than later.
* The web-ext tool will require some ramp-up time for scaffolding.
* The community of jpm contributors will need to shift focus to web-ext.

[web-ext-user-docs]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext

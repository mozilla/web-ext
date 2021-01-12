# Development of web-ext

Hi! Thanks for your interest in helping make
[WebExtension](https://developer.mozilla.org/en-US/Add-ons/WebExtensions)
development more awesome by contributing to the `web-ext` tool. Here are links to all the sections in this document:

<!-- If you change any of the headings in this document, remember to update the table of contents. -->
<!-- To update the TOC, run the command `npm run gen-contributing-toc` from your root directory and you will auto generate a new TOC. -->

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Picking an issue](#picking-an-issue)
- [Installation](#installation)
  - [Develop all the things](#develop-all-the-things)
  - [Run all application tests](#run-all-application-tests)
    - [Run a single test](#run-a-single-test)
    - [Debug a test](#debug-a-test)
  - [Build web-ext](#build-web-ext)
  - [Check for lint](#check-for-lint)
  - [Check for Flow errors](#check-for-flow-errors)
    - [Missing annotation](#missing-annotation)
    - [How to read Flow errors related to type inconsistencies](#how-to-read-flow-errors-related-to-type-inconsistencies)
    - [Flow type conventions](#flow-type-conventions)
  - [Code Coverage](#code-coverage)
  - [Working on the CLI](#working-on-the-cli)
    - [Adding a command option](#adding-a-command-option)
  - [Working on `web-ext sign`](#working-on-web-ext-sign)
  - [Creating a pull request](#creating-a-pull-request)
  - [Writing commit messages](#writing-commit-messages)
    - [Checking commit message formatting](#checking-commit-message-formatting)
  - [Creating a release](#creating-a-release)
    - [Release schedule](#release-schedule)
- [Documentation](#documentation)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->



# Picking an issue

If you're looking for a small task to work on so you can get familiar with the
process of contributing patches, have a read through these
[good first bugs](https://github.com/mozilla/web-ext/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+bug%22).

If you'd like to work on a bug, please comment on it to let the maintainers know. If someone else has already commented and taken up that bug, please refrain from working on it and submitting a PR without asking the maintainers as it leads to unnecessary duplication of effort.


# Installation

To get started on a patch, first install `web-ext` from [source](README.md#installation-from-source).

## Develop all the things

Your one stop command to continuously build, run tests, check for
JavaScript syntax problems, and check for [Flow] errors is this:

    npm start

The other commands below are just variations on this.

## Run all application tests

To run the entire suite of tests once and exit, type:

    npm test

This is the same as the `npm start` command but it won't re-run automatically as
you edit files. It's also a little slower because there's no caching.
Unlike `npm start`, it will execute the functional tests which may
reveal unexpected breakage.

### Run a single test

Instead of running the entire suite, you can run a single test by invoking
the `mocha` executable directly with the `-f` option to filter by test
description. For example, if the test you'd like to run is defined in
`tests/test.program.js` and is described as
"turns sourceDir into an absolute path" then you could run it like this:

    ./node_modules/.bin/mocha -r babel-core/register tests/unit/test.program.js -f "sourceDir"

### Debug a test

You can enter the [Node debugger](https://nodejs.org/api/debugger.html) by
directly invoking the `mocha` executable with the `debug` command. For example,
if the test you want to debug is defined in `tests/test.program.js` then you
could enter the debugger like this:

    ./node_modules/.bin/mocha debug -r babel-core/register tests/unit/test.program.js

You could also put the `debugger` statement somewhere in the code to set a
breakpoint.

## Build web-ext

Type `npm run build` to build a new version of the libraries used by the
`./bin/web-ext` command. When successful, you will see newly built files in
the `./dist/` directory. This is done automatically by `npm start`.
By default, npm run build creates a development build of web-ext. To create a
production build, use the NODE_ENV variable like this:

    NODE_ENV=production npm run build

## Check for lint

Type `npm run lint` to make sure there are no syntax errors or other house
keeping problems in the source code.

If you are deep down some rabbit hole, you can skip lint checks temporarily
by setting `$SKIP_LINT` in the environment. Here is an example of running
the test suite without lint checks:

    SKIP_LINT=1 npm test

## Check for Flow errors

This project relies on [Flow] to ensure functions and
classes are used correctly. Run all Flow checks with `npm run flow-check`.

The first steps to learn how to fix flow errors are:

- learn how to read the flow annotations
- learn how to write new type definitions or change the existing definitions
- learn to read the flow errors and know some of the more common errors

To learn more about the syntax used to add the flow annotations and how to
write/change the type definitions, you should take a look at the official
[Flow docs](https://flowtype.org/docs/getting-started.html)

The following sections contain additional information related to common
flow errors and how to read and fix them.

### Missing annotation

This is a pretty common flow error and it is usually the simplest to fix.

It means that the new code added in the sources doesn't define the types
of the functions and methods parameters, e.g. on the following snippet:

```js
export default async function getValidatedManifest(sourceDir) {
  ...
}
```

flow is going to raise the error:

```
src/util/manifest.js:32
 32:   sourceDir
       ^^^^^^^^^ parameter `sourceDir`. Missing annotation
```

which is fixed by annotating the function correctly, e.g.:

```js
export default async function getValidatedManifest(
  sourceDir: string
): Promise<ExtensionManifest> {
  ...
}
```

### How to read Flow errors related to type inconsistencies

Some of the flow errors are going to contain references to the two sides
of the flowtype errors:

```
tests/unit/test-cmd/test.build.js:193
193:         manifestData: basicManifest,
                           ^^^^^^^^^^^^^ property `applications`. Property not found in
 24: export type ExtensionManifest = {|
                                     ^ object type. See: src/util/manifest.js:24

```

- The first part points to the offending code (where the type violation has been found)
- The second part points to the violated type annotation (where the type has been defined)

When flow raises this kind of error (e.g. it is pretty common during a refactoring),
we have to evaluate which one of the two sides is wrong.

As an example, by reading the above error it is not immediately clear which part should be fixed.

To be sure about which is the proper fix, we have to look at the code near to both the lines
and evaluate the actual reason, e.g.:

- it is possible that we wrote some of the property names wrong (in the code or in the type definitions)
- or the defined type is supposed to contain a new property and it is not yet in the related type definitions

### Flow type conventions

In the `web-ext` sources we are currently using the following conventions (and they should be preserved
when we change or add flow type definitions):

- the type names should be CamelCased (e.g. `ExtensionManifest`)
- the types used to annotate functions or methods defined in a module should be exported only when
  they are supposed to be used by other modules (`export type ExtensionManifest = ...`)
- any type imported from the other modules should be in the module preamble (near to the regular ES6 imports)
- object types should be exact object types (e.g. `{| ... |}`), because flow will be able to raise
  errors when we try to set or get a property not explicitly defined in the flow type (which is
  particularly helpful during refactorings)
- all the flow type definitions should be as close as possible to the function they annotate
- we prefer not to use external files (e.g. `.flow.js` files or declaration files configured in the
  `.flowconfig` file) for the `web-ext` flow types.

## Code Coverage

You can generate code coverage reports every time you run the test suite
by setting `$COVERAGE` in the environment. This will show you if you forgot
to add a test to cover a new part of the program.
Here is an example of running the test suite with code coverage:

    COVERAGE=y npm test

You can also generate coverage reports continously as you edit files:

    COVERAGE=y npm start

Once a report has been generated, it can be found in the `./coverage` directory.

## Working on the CLI

This section will show you how to add a new commands and options.

`web-ext` relies on [yargs](http://yargs.js.org) to parse its commands and
their options. The commands are defined in `src/program.js` in the `main` function.
For example, the `build` command is defined like this:

````javascript
program
  .command(
    'build',
    'Create a web extension package from source',
    commands.build, {
      'as-needed': {
        describe: 'Watch for file changes and re-build as needed',
        type: 'boolean',
      },
    })
````

The first argument to `program.command()` is the command name, the second is the
description (shown for `--help`), the third is a callback that executes the
command, and the last is an object defining all available options.

The `cmd` directory is where all command callbacks are stored. In this example,
`commands.build` is defined in `src/cmd/build.js` but you can always trace the
imports to find each one.

When `web-ext` executes a command callback, it passes an object containing all option
values, including global options (such as `--source-dir`). Each option key is
converted from hyphenated words to [camelCase](https://en.wikipedia.org/wiki/Camel_case)
words. So, the
`--as-needed` and `--source-dir` options would be passed like:

````javascript
commands.build({asNeeded: true, sourceDir: './src/extension'})
  .then((result) => {
    // ...
  });
````

### Adding a command option

To add a command option, locate the relevant command definition (i.e. `run`)
and specify a new option definition as an object.
Here is an example of adding the `--file-path` option:

````javascript
program
  // other commands...
  .command('run', 'Run the web extension', commands.run, {
    // other options...
    'file-path': {
      describe: 'An absolute file path.',
      alias: ['fp'],
      demandOption: false,
      requiresArg: true,
      type: 'string',
    },
  })
````

This option can be used like `web-ext run --file-path=./path/to/file` or
`--fp=./path/to/file`. Since Yargs can be pretty powerful yet not completely
intuitive at times, you may need to dig into the
[docs](http://yargs.js.org/docs/). Any key that you can pass to
[yargs.option](http://yargs.js.org/docs/#methods-optionkey-opt)
is a key you can pass to each option object when calling `program.command()`.

## Working on `web-ext sign`

When you are developing a fix or feature for the `web-ext sign` command it's wise
to use a development version of the
[signing API](http://addons-server.readthedocs.io/en/latest/topics/api/signing.html)
so as not to disturb any real `addons.mozilla.org` data.

* Read through how to use the
  [web-ext sign](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext#Distributing_your_own_WebExtension)
  command so you understand it.
* Create an API key on the development version of the
  [Manage API Keys](https://addons-dev.allizom.org/en-US/developers/addon/api/key/)
  page. You will need to register an account if you don't have one already. Make
  sure you use a password that is different from your production account.
* Let's say your generated *JWT issuer* is `user:123` and your *JWT secret* is
  `abc1234`. Here is an example of a command you can run that will use the
  development API:

  ````
  web-ext sign --api-key user:123 --api-secret abc1234 \
      --api-url-prefix https://addons-dev.allizom.org/api/v4
  ````
* Signed add-ons created with the development API are hard to install into
  Firefox. If you need to test installation of add-ons (you probably don't)
  then you'd have to use our staging API server. File an issue for information
  on that.

## Creating a pull request

When you create a
[pull request](https://help.github.com/articles/creating-a-pull-request/)
for a new fix or feature, be sure to mention the issue
number for what you're working on.
The best way to do it is to mention the issue like
this at the top of your description:

    Fixes #123

The issue number in this case is "123."
The word *Fixes* is magical; github will automatically close the issue when your
pull request is merged.

## Writing commit messages

The subject of the pull requests and commit messages must adhere to the Angular style of
[semantic messages](https://github.com/angular/angular.js/blob/master/CONTRIBUTING.md#commit).
This allows us to auto-generate a changelog without too much noise in it.
Additionally, write the commit message in past tense so it will read
naturally as a historic changelog.

Examples:
* `feat: Added a systematic dysfunctioner`
* `fix: Fixed hang in systematic dysfunctioner`
* `docs: Improved contributor docs`
* `style: Added no-console linting, cleaned up code`
* `refactor: Split out dysfunctioner for testability`
* `perf: Systematic dysfunctioner is now 2x faster`
* `test: Added more tests for systematic dysfunctioner`
* `chore: Upgraded yargs to 3.x.x`

If you want to use scopes then it would look more like:
`feat(dysfunctioner): Added --quiet option`.

### Checking commit message formatting

The commit message formatting described above is automatically enforced
each time you commit to your work branch to make continuous integration smoother.

## Creating a release

To release a new version of `web-ext`, follow these steps:

* Pull from master to make sure you're up to date.
* Bump the version in `package.json`.
* Commit and push the version change
  (or create and merge a pull request for it).
* Create a changelog by running `npm run changelog`.
  This will output Markdown of all unreleased changes.
* Create a [new release](https://github.com/mozilla/web-ext/releases/new)
  and paste in the changelog Markdown.
  It may require some manual editing. For example, some commit messages
  might have been truncated.
  Title the github release after the new version you just
  added to `package.json` in the previous commit (example: `1.0.4`).
* When you publish the release, github creates a tag.
  When TravisCI builds the tag,
  it will automatically publish the package to
  [npm](https://www.npmjs.com/package/web-ext).
* After the package has been published, check the
  [needs: docs](https://github.com/mozilla/web-ext/issues?utf8=%E2%9C%93&q=is%3Aclosed%20label%3A%22needs%3A%20docs%22%20)
  label to see if
  [the user docs](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext)
  need updating.

### Release schedule

The `web-ext lint` command uses the [addons-linter](https://github.com/mozilla/addons-linter) library. That library contains a copy of the schema from Firefox. Since Firefox schema changes regularly we'd like to release new versions of web-ext around the time that Firefox creates a Beta release. That means developers will have a `lint` command that closely matches Firefox.

The schedule is flexible, if a release is due to happen close to a Firefox release, then it might make sense to try and sync the two releases into one. A full release schedule for [Firefox is available](https://wiki.mozilla.org/RapidRelease/Calendar).

# Documentation

If the issue you're working on involves changing any of the headings in this document [CONTRIBUTING.md](https://github.com/mozilla/web-ext/blob/master/CONTRIBUTING.md),
before making a commit and submitting a pull request, please remember to update the table of contents.
To update the TOC, run the command `npm run gen-contributing-toc` from your root directory and you will auto generate a new TOC.

[Flow]: http://flowtype.org/

# Development of web-ext

Hi! Thanks for your interest in helping make
[WebExtension](https://developer.mozilla.org/en-US/Add-ons/WebExtensions)
development more awesome by contributing to the `web-ext` tool.

If you're looking for a small task to work on so you can get familiar with the
process of contributing patches, have a read through these
[good first bugs](https://github.com/mozilla/web-ext/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+bug%22).

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

## Code Coverage

You can generate code coverage reports every time you run the test suite
by setting `$COVERAGE` in the environment. This will show you if you forgot
to add a test to cover a new part of the program.
Here is an example of running the test suite with code coverage:

    COVERAGE=y npm test

You can also generate coverage reports continously as you edit files:

    COVERAGE=y npm start

Once a report has been generated, it can be found in the `./coverage` directory.

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
      --api-url-prefix https://addons-dev.allizom.org/api/v3
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

Commit messages must adhere to the Angular style of
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
  [needs user docs](https://github.com/mozilla/web-ext/issues?utf8=%E2%9C%93&q=is%3Aclosed%20label%3A%22needs%20user%20docs%22%20)
  label to see if
  [the user docs](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext)
  need updating.


[Flow]: http://flowtype.org/

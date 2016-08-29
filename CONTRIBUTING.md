# Development of web-ext

To get started, first install it from [source](README.md#installation-from-source).

## Develop all the things

Your one stop command to continuously build, run tests, check for
syntax errors, and check for flow errors is this:

    npm start

The other commands below are just variations on this.

## Run all application tests

To run the entire suite of tests once and exit, type:

    npm test

This is the same as the `develop` command but it won't re-run automatically as
you edit files. It's also a little slower because there's no caching.

### Run a single test

Instead of running the entire suite, you can run a single test by invoking
the `mocha` executable directly with the `-f` option to filter by test
description. For example, if the test you'd like to run is defined in
`tests/test.program.js` and is described as
"turns sourceDir into an absolute path" then you could run it like this:

    ./node_modules/.bin/mocha -r babel-core/register tests/test.program.js -f "sourceDir"

### Debug a test

You can enter the [Node debugger](https://nodejs.org/api/debugger.html) by
directly invoking the `mocha` executable with the `debug` command. For example,
if the test you want to debug is defined in `tests/test.program.js` then you
could enter the debugger like this:

    ./node_modules/.bin/mocha debug -r babel-core/register tests/test.program.js

You could also put the `debugger` statement somewhere in the code to set a
breakpoint.

## Build web-ext

Type `npm run build` to build a new version of the libraries used by the
`./bin/web-ext` command. When successful, you will see newly built files in
the `./dist/` directory.

## Check for lint

Type `npm run lint` to make sure there are no syntax errors or other house
keeping problems in the source code.

If you are deep down some rabbit hole, you can skip lint checks temporarily
by setting `$SKIP_LINT` in the environment. Here is an example of running
the test suite without lint checks:

    SKIP_LINT=1 npm test

## Check for Flow errors

This project relies on [flow](http://flowtype.org/) to ensure functions and
classes are used correctly. Run all flow checks with `npm run flow-check`.

## Code Coverage

You can generate Code Coverage reports every time you run the test suite
by setting `$COVERAGE` in the environment. Here is an example of running
the test suite on the instrumented source code:

    COVERAGE=y npm test

or even when the test suite re-runs automatically as you edit files:

    COVERAGE=y npm start

Once the report has been generated, it can be found in the `./coverage` directory.

## Writing commit messages

First, try to follow the
[standard git commit message style](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html).
This includes limiting the summary to 50 chars (which integrates well with git
tools) but favor readability over conciseness if you need to go over that limit.

Next, try adhering to the Angular style of
[semantic messages](https://github.com/angular/angular.js/blob/master/CONTRIBUTING.md#commit)
when writing a commit message.
This should allow us to auto-generate a changelog without too much noise in it.
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

### Check for commit message lint

You can test that your commit message is formatted in a way that will support
our changelog generator like this:

    npm run changelog-lint

## Squashing commits

When fixing up a pull request based on code review comments,
[squash all commits together](https://github.com/ginatrapani/todo.txt-android/wiki/Squash-All-Commits-Related-to-a-Single-Issue-into-a-Single-Commit)
before merging. This will allow us to auto-generate a more concise
changelog. If a pull request contains more than one feature or fix then
it is okay to include each as a separate commit.

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

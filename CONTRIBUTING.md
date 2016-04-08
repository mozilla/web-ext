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

### Build web-ext

Type `npm run build` to build a new version of the `./bin/web-ext` command.

### Check for lint

Type `npm run lint` to make sure there are no syntax errors or other house
keeping problems in the source code.

If you are deep down some rabbit hole, you can skip lint checks temporarily
by setting `$SKIP_LINT` in the environment. Here is an example of running
the test suite without lint checks:

    SKIP_LINT=1 npm test

### Check for Flow errors

This project relies on [flow](http://flowtype.org/) to ensure functions and
classes are used correctly. Run all flow checks with `npm run flow-check`.

### Code Coverage

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
* `feat(): Added a systematic dysfunctioner`
* `fix(): Fixed hang in systematic dysfunctioner`
* `docs(): Improved contributor docs`
* `style(): Added no-console linting, cleaned up code`
* `refactor(): Split out dysfunctioner for testability`
* `perf(): Systematic dysfunctioner is now 2x faster`
* `test(): Added more tests for systematic dysfunctioner`
* `chore(): Upgraded yargs to 3.x.x`

If you want to use scopes then it would look more like:
`feat(dysfunctioner): Added --quiet option`.

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
* Commit and push the version change.
* Tag master (example: `git tag 0.0.1`) and run `git push --tags upstream`.
* Run `npm publish`.

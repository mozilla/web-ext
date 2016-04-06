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

Please try adhering to the Angular style of
[semantic messages](https://github.com/angular/angular.js/blob/master/CONTRIBUTING.md#commit)
when writing a commit message. We don't really use scopes so you can leave them
blank. For example: `feat(): Adds support for a systematic dysfunctioner`.
This will allow us to auto-generate a more useful changelog.

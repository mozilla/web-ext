/* @flow */
import path from 'path';
import {readFileSync} from 'fs';

import git from 'git-rev-sync';
import yargs from 'yargs';
import camelCase from 'camelcase';

import defaultCommands from './cmd';
import {UsageError} from './errors';
import {createLogger, consoleStream as defaultLogStream} from './util/logger';
import {coerceCLICustomPreference} from './firefox/preferences';
import {checkForUpdates as defaultUpdateChecker} from './util/updates';

const log = createLogger(__filename);
const envPrefix = 'WEB_EXT';


type ProgramOptions = {|
  absolutePackageDir?: string,
|}

// TODO: add pipes to Flow type after https://github.com/facebook/flow/issues/2405 is fixed

type ExecuteOptions = {
  checkForUpdates?: Function,
  systemProcess?: typeof process,
  logStream?: typeof defaultLogStream,
  getVersion?: Function,
  shouldExitProgram?: boolean,
  globalEnv?: string,
}


/*
 * The command line program.
 */
export class Program {
  yargs: any;
  commands: { [key: string]: Function };
  shouldExitProgram: boolean;
  defaultValues: Object;

  constructor(
    argv: ?Array<string>,
    {
      absolutePackageDir = process.cwd(),
    }: ProgramOptions = {}
  ) {
    // This allows us to override the process argv which is useful for
    // testing.
    // NOTE: process.argv.slice(2) removes the path to node and web-ext
    // executables from the process.argv array.
    argv = argv || process.argv.slice(2);

    // NOTE: always initialize yargs explicitly with the package dir
    // so that we are sure that it is going to load the 'boolean-negation: false'
    // config (See web-ext#469 for rationale).
    const yargsInstance = yargs(argv, absolutePackageDir);

    this.shouldExitProgram = true;
    this.yargs = yargsInstance;
    this.yargs.strict();

    this.commands = {};
    this.defaultValues = {};
  }

  command(
    name: string, description: string, executor: Function,
    commandOptions: Object = {}
  ): Program {
    this.defaultValues[name] = setDefaultValues(commandOptions);
    this.yargs.command(name, description, (yargsForCmd) => {
      if (!commandOptions) {
        return;
      }
      return yargsForCmd
        // Make sure the user does not add any extra commands. For example,
        // this would be a mistake because lint does not accept arguments:
        // web-ext lint ./src/path/to/file.js
        .demandCommand(0, 0, undefined,
                       'This command does not take any arguments')
        .strict()
        .exitProcess(this.shouldExitProgram)
        // Calling env() will be unnecessary after
        // https://github.com/yargs/yargs/issues/486 is fixed
        .env(envPrefix)
        .options(commandOptions);
    });
    this.commands[name] = executor;
    return this;
  }

  setGlobalOptions(options: Object): Program {
    // This is a convenience for setting global options.
    // An option is only global (i.e. available to all sub commands)
    // with the `global` flag so this makes sure every option has it.
    this.defaultValues = {...this.defaultValues, ...setDefaultValues(options)};
    Object.keys(options).forEach((key) => {
      options[key].global = true;
      if (options[key].demand === undefined) {
        // By default, all options should be "demanded" otherwise
        // yargs.strict() will think they are missing when declared.
        options[key].demand = true;
      }
    });
    this.yargs.options(options);
    return this;
  }

  async execute(
    absolutePackageDir: string,
    {
      checkForUpdates = defaultUpdateChecker, systemProcess = process,
      logStream = defaultLogStream, getVersion = defaultVersionGetter,
      shouldExitProgram = true, globalEnv = WEBEXT_BUILD_ENV,
    }: ExecuteOptions = {}
  ): Promise<void> {

    this.shouldExitProgram = shouldExitProgram;
    this.yargs.exitProcess(this.shouldExitProgram);

    const argv = this.yargs.argv;
    const cmd = argv._[0];

    // Command line option (pref) renamed for internal use (customPref).
    argv.customPrefs = argv.pref;

    const runCommand = this.commands[cmd];

    if (argv.verbose) {
      logStream.makeVerbose();
      log.info('Version:', getVersion(absolutePackageDir));
    }

    try {
      if (cmd === undefined) {
        throw new UsageError('No sub-command was specified in the args');
      }
      if (!runCommand) {
        throw new UsageError(`Unknown command: ${cmd}`);
      }
      if (globalEnv === 'production') {
        checkForUpdates ({
          version: getVersion(absolutePackageDir),
        });
      }

      await runCommand(argv, {shouldExitProgram});

    } catch (error) {
      const prefix = cmd ? `${cmd}: ` : '';
      if (!(error instanceof UsageError) || argv.verbose) {
        log.error(`\n${prefix}${error.stack}\n`);
      } else {
        log.error(`\n${prefix}${error}\n`);
      }
      if (error.code) {
        log.error(`${prefix}Error code: ${error.code}\n`);
      }

      if (this.shouldExitProgram) {
        systemProcess.exit(1);
      } else {
        throw error;
      }
    }
  }
}

// A global variable generated by DefinePlugin, generated in webpack.config.js
declare var WEBEXT_BUILD_ENV: string;

function setDefaultValues(options: Object): Object {
  const defaultValues = {};
  Object.keys(options).forEach((key) => {
    const camelCasedKey = camelCase(key);
    if (options[key].type === 'boolean') {
      defaultValues[camelCasedKey] = false;
    }
    if (typeof(options[key].default) !== 'undefined') {
      defaultValues[camelCasedKey] = options[key].default;
    }
  });
  return defaultValues;
}

//A defintion of type of argument for defaultVersionGetter
type versionGetterOptions = {
  globalEnv?: string,
};

export function defaultVersionGetter(
  absolutePackageDir: string,
  {globalEnv = WEBEXT_BUILD_ENV}: versionGetterOptions = {}
): string {
  if (globalEnv === 'production') {
    log.debug('Getting the version from package.json');
    const packageData: any = readFileSync(
      path.join(absolutePackageDir, 'package.json'));
    return JSON.parse(packageData).version;
  } else {
    log.debug('Getting version from the git revision');
    return `${git.branch(absolutePackageDir)}-${git.long(absolutePackageDir)}`;
  }
}

// TODO: add pipes to Flow type after https://github.com/facebook/flow/issues/2405 is fixed

type MainParams = {
  getVersion?: Function,
  commands?: Object,
  argv: Array<any>,
  runOptions?: Object,
}

export function main(
  absolutePackageDir: string,
  {
    getVersion = defaultVersionGetter, commands = defaultCommands, argv,
    runOptions = {},
  }: MainParams = {}
): Promise<any> {

  const program = new Program(argv, {absolutePackageDir});

  // yargs uses magic camel case expansion to expose options on the
  // final argv object. For example, the 'artifacts-dir' option is alternatively
  // available as argv.artifactsDir.
  program.yargs
    .usage(`Usage: $0 [options] command

Option values can also be set by declaring an environment variable prefixed
with $${envPrefix}_. For example: $${envPrefix}_SOURCE_DIR=/path is the same as
--source-dir=/path.

To view specific help for any given command, add the command name.
Example: $0 --help run.
`)
    .help('help')
    .alias('h', 'help')
    .env(envPrefix)
    .version(() => getVersion(absolutePackageDir))
    .demandCommand(1, 'You must specify a command')
    .strict();

  program.setGlobalOptions({
    'source-dir': {
      alias: 's',
      describe: 'Web extension source directory.',
      default: process.cwd(),
      requiresArg: true,
      type: 'string',
      coerce: path.resolve,
    },
    'artifacts-dir': {
      alias: 'a',
      describe: 'Directory where artifacts will be saved.',
      default: path.join(process.cwd(), 'web-ext-artifacts'),
      normalize: true,
      requiresArg: true,
      type: 'string',
    },
    'verbose': {
      alias: 'v',
      describe: 'Show verbose output',
      type: 'boolean',
    },
    'ignore-files': {
      alias: 'i',
      describe: 'A list of glob patterns to define which files should be ' +
                'ignored. (Example: --ignore-files=path/to/first.js ' +
                'path/to/second.js "**/*.log")',
      demand: false,
      requiresArg: true,
      type: 'array',
    },
  });

  program
    .command(
      'build',
      'Create a web extension package from source',
      commands.build, {
        'as-needed': {
          describe: 'Watch for file changes and re-build as needed',
          type: 'boolean',
        },
        'overwrite-dest': {
          alias: 'o',
          describe: 'Overwrite destination package if it exists.',
          type: 'boolean',
        },
      })
    .command(
      'sign',
      'Sign the web extension so it can be installed in Firefox',
      commands.sign, {
        'api-key': {
          describe: 'API key (JWT issuer) from addons.mozilla.org',
          demand: true,
          type: 'string',
        },
        'api-secret': {
          describe: 'API secret (JWT secret) from addons.mozilla.org',
          demand: true,
          type: 'string',
        },
        'api-url-prefix': {
          describe: 'Signing API URL prefix',
          default: 'https://addons.mozilla.org/api/v3',
          demand: true,
          type: 'string',
        },
        'api-proxy': {
          describe:
            'Use a proxy to access the signing API. ' +
            'Example: https://yourproxy:6000 ',
          demand: false,
          type: 'string',
        },
        'id': {
          describe:
            'A custom ID for the extension. This has no effect if the ' +
            'extension already declares an explicit ID in its manifest.',
          demand: false,
          type: 'string',
        },
        'timeout': {
          describe: 'Number of milliseconds to wait before giving up',
          type: 'number',
        },
      })
    .command('run', 'Run the web extension', commands.run, {
      'firefox': {
        alias: ['f', 'firefox-binary'],
        describe: 'Path or alias to a Firefox executable such as firefox-bin ' +
                  'or firefox.exe. ' +
                  'If not specified, the default Firefox will be used. ' +
                  'You can specify the following aliases in lieu of a path: ' +
                  'firefox, beta, nightly, firefoxdeveloperedition.',
        demand: false,
        type: 'string',
      },
      'firefox-profile': {
        alias: 'p',
        describe: 'Run Firefox using a copy of this profile. The profile ' +
                  'can be specified as a directory or a name, such as one ' +
                  'you would see in the Profile Manager. If not specified, ' +
                  'a new temporary profile will be created.',
        demand: false,
        type: 'string',
      },
      'keep-profile-changes': {
        describe: 'Run Firefox directly in custom profile. Any changes to ' +
                  'the profile will be saved.',
        demand: false,
        type: 'boolean',
      },
      'no-reload': {
        describe: 'Do not reload the extension when source files change',
        demand: false,
        type: 'boolean',
      },
      'pre-install': {
        describe: 'Pre-install the extension into the profile before ' +
                  'startup. This is only needed to support older versions ' +
                  'of Firefox.',
        demand: false,
        type: 'boolean',
      },
      'pref': {
        describe: 'Launch firefox with a custom preference ' +
                  '(example: --pref=general.useragent.locale=fr-FR). ' +
                  'You can repeat this option to set more than one ' +
                  'preference.',
        demand: false,
        requiresArg: true,
        type: 'string',
        coerce: coerceCLICustomPreference,
      },
      'start-url': {
        alias: ['u', 'url'],
        describe: 'Launch firefox at specified page',
        demand: false,
        requiresArg: true,
        type: 'string',
      },
      'browser-console': {
        alias: ['bc'],
        describe: 'Open the DevTools Browser Console.',
        demand: false,
        type: 'boolean',
      },
    })
    .command('lint', 'Validate the web extension source', commands.lint, {
      'output': {
        alias: 'o',
        describe: 'The type of output to generate',
        type: 'string',
        default: 'text',
        choices: ['json', 'text'],
      },
      'metadata': {
        describe: 'Output only metadata as JSON',
        type: 'boolean',
        default: false,
      },
      'warnings-as-errors': {
        describe: 'Treat warnings as errors by exiting non-zero for warnings',
        alias: 'w',
        type: 'boolean',
        default: false,
      },
      'pretty': {
        describe: 'Prettify JSON output',
        type: 'boolean',
        default: false,
      },
      'self-hosted': {
        describe:
          'Your extension will be self-hosted. This disables messages ' +
          'related to hosting on addons.mozilla.org.',
        type: 'boolean',
        default: false,
      },
      'boring': {
        describe: 'Disables colorful shell output',
        type: 'boolean',
        default: false,
      },
    })
    .command('docs', 'Open the web-ext documentation in a browser',
      commands.docs, {});

  return program.execute(absolutePackageDir, runOptions);
}

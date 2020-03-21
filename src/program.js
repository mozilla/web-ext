/* @flow */
import os from 'os';
import path from 'path';
import {readFileSync} from 'fs';

import camelCase from 'camelcase';
import decamelize from 'decamelize';
import git from 'git-rev-sync';
import yargs from 'yargs';
import { Parser as yargsParser } from 'yargs/yargs';

import defaultCommands from './cmd';
import {UsageError} from './errors';
import {createLogger, consoleStream as defaultLogStream} from './util/logger';
import {coerceCLICustomPreference} from './firefox/preferences';
import {checkForUpdates as defaultUpdateChecker} from './util/updates';
import {
  discoverConfigFiles as defaultConfigDiscovery,
  loadJSConfigFile as defaultLoadJSConfigFile,
  applyConfigToArgv as defaultApplyConfigToArgv,
} from './config';

const log = createLogger(__filename);
const envPrefix = 'WEB_EXT';


type ProgramOptions = {|
  absolutePackageDir?: string,
|}

export type VersionGetterFn = (absolutePackageDir: string) => string;

// TODO: add pipes to Flow type after https://github.com/facebook/flow/issues/2405 is fixed

type ExecuteOptions = {
  checkForUpdates?: Function,
  systemProcess?: typeof process,
  logStream?: typeof defaultLogStream,
  getVersion?: VersionGetterFn,
  applyConfigToArgv?: typeof defaultApplyConfigToArgv,
  discoverConfigFiles?: typeof defaultConfigDiscovery,
  loadJSConfigFile?: typeof defaultLoadJSConfigFile,
  shouldExitProgram?: boolean,
  globalEnv?: string,
}


/*
 * The command line program.
 */
export class Program {
  absolutePackageDir: string;
  yargs: any;
  commands: { [key: string]: Function };
  shouldExitProgram: boolean;
  verboseEnabled: boolean;
  options: Object;
  programArgv: Array<string>;

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
    this.programArgv = argv;

    // NOTE: always initialize yargs explicitly with the package dir
    // to avoid side-effects due to yargs looking for its configuration
    // section from a package.json file stored in an arbitrary directory
    // (e.g. in tests yargs would end up loading yargs config from the
    // mocha package.json). web-ext package.json doesn't contain any yargs
    // section as it is deprecated and we configure yargs using
    // yargs.parserConfiguration. See web-ext#469 for rationale.
    const yargsInstance = yargs(argv, absolutePackageDir);

    this.absolutePackageDir = absolutePackageDir;
    this.verboseEnabled = false;
    this.shouldExitProgram = true;

    this.yargs = yargsInstance;
    this.yargs.parserConfiguration({
      'boolean-negation': true,
    });
    this.yargs.strict();

    this.commands = {};
    this.options = {};
  }

  command(
    name: string, description: string, executor: Function,
    commandOptions: Object = {}
  ): Program {
    this.options[camelCase(name)] = commandOptions;

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
    this.options = {...this.options, ...options};
    Object.keys(options).forEach((key) => {
      options[key].global = true;
      if (options[key].demandOption === undefined) {
        // By default, all options should be "demanded" otherwise
        // yargs.strict() will think they are missing when declared.
        options[key].demandOption = true;
      }
    });
    this.yargs.options(options);
    return this;
  }

  enableVerboseMode(
    logStream: typeof defaultLogStream,
    version: string
  ): void {
    if (this.verboseEnabled) {
      return;
    }

    logStream.makeVerbose();
    log.info('Version:', version);
    this.verboseEnabled = true;
  }

  // Retrieve the yargs argv object and apply any further fix needed
  // on the output of the yargs options parsing.
  getArguments(): Object {
    const argv = this.yargs.argv;

    // Yargs boolean options doesn't define the no* counterpart
    // with negate-boolean on Yargs 15. Define as expected by the
    // web-ext execute method.
    if (argv.configDiscovery != null) {
      argv.noConfigDiscovery = !argv.configDiscovery;
    }
    if (argv.reload != null) {
      argv.noReload = !argv.reload;
    }

    // Replacement for the "requiresArg: true" parameter until the following bug
    // is fixed: https://github.com/yargs/yargs/issues/1098
    if (argv.ignoreFiles && !argv.ignoreFiles.length) {
      throw new UsageError('Not enough arguments following: ignore-files');
    }

    if (argv.startUrl && !argv.startUrl.length) {
      throw new UsageError('Not enough arguments following: start-url');
    }

    return argv;
  }

  // Remove WEB_EXT_* environment vars that are not a global cli options
  // or an option supported by the current command (See #793).
  cleanupProcessEnvConfigs(systemProcess: typeof process) {
    const cmd = yargsParser(this.programArgv)._[0];
    const env = systemProcess.env || {};
    const toOptionKey = (k) => decamelize(
      camelCase(k.replace(envPrefix, '')), '-'
    );

    if (cmd) {
      Object.keys(env)
        .filter((k) => k.startsWith(envPrefix))
        .forEach((k) => {
          const optKey = toOptionKey(k);
          const globalOpt = this.options[optKey];
          const cmdOpt = this.options[cmd] && this.options[cmd][optKey];

          if (!globalOpt && !cmdOpt) {
            log.debug(`Environment ${k} not supported by web-ext ${cmd}`);
            delete env[k];
          }
        });
    }
  }

  async execute(
    {
      checkForUpdates = defaultUpdateChecker,
      systemProcess = process,
      logStream = defaultLogStream,
      getVersion = defaultVersionGetter,
      applyConfigToArgv = defaultApplyConfigToArgv,
      discoverConfigFiles = defaultConfigDiscovery,
      loadJSConfigFile = defaultLoadJSConfigFile,
      shouldExitProgram = true,
      globalEnv = WEBEXT_BUILD_ENV,
    }: ExecuteOptions = {}
  ): Promise<void> {
    this.shouldExitProgram = shouldExitProgram;
    this.yargs.exitProcess(this.shouldExitProgram);

    this.cleanupProcessEnvConfigs(systemProcess);
    const argv = this.getArguments();

    const cmd = argv._[0];

    const version = getVersion(this.absolutePackageDir);
    const runCommand = this.commands[cmd];

    if (argv.verbose) {
      this.enableVerboseMode(logStream, version);
    }

    let adjustedArgv = {...argv};

    try {
      if (cmd === undefined) {
        throw new UsageError('No sub-command was specified in the args');
      }
      if (!runCommand) {
        throw new UsageError(`Unknown command: ${cmd}`);
      }
      if (globalEnv === 'production') {
        checkForUpdates({version});
      }

      const configFiles = [];

      if (argv.configDiscovery) {
        log.debug(
          'Discovering config files. ' +
          'Set --no-config-discovery to disable');
        const discoveredConfigs = await discoverConfigFiles();
        configFiles.push(...discoveredConfigs);
      } else {
        log.debug('Not discovering config files');
      }

      if (argv.config) {
        configFiles.push(path.resolve(argv.config));
      }

      if (configFiles.length) {
        const niceFileList = configFiles
          .map((f) => f.replace(process.cwd(), '.'))
          .map((f) => f.replace(os.homedir(), '~'))
          .join(', ');
        log.info(
          'Applying config file' +
          `${configFiles.length !== 1 ? 's' : ''}: ` +
          `${niceFileList}`);
      }

      configFiles.forEach((configFileName) => {
        const configObject = loadJSConfigFile(configFileName);
        adjustedArgv = applyConfigToArgv({
          argv: adjustedArgv,
          argvFromCLI: argv,
          configFileName,
          configObject,
          options: this.options,
        });
      });

      if (adjustedArgv.verbose) {
        // Ensure that the verbose is enabled when specified in a config file.
        this.enableVerboseMode(logStream, version);
      }

      await runCommand(adjustedArgv, {shouldExitProgram});

    } catch (error) {
      if (!(error instanceof UsageError) || adjustedArgv.verbose) {
        log.error(`\n${error.stack}\n`);
      } else {
        log.error(`\n${error}\n`);
      }
      if (error.code) {
        log.error(`Error code: ${error.code}\n`);
      }

      log.debug(`Command executed: ${cmd}`);

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

//A defintion of type of argument for defaultVersionGetter
type VersionGetterOptions = {
  globalEnv?: string,
};

export function defaultVersionGetter(
  absolutePackageDir: string,
  {globalEnv = WEBEXT_BUILD_ENV}: VersionGetterOptions = {}
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
  getVersion?: VersionGetterFn,
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
  const version = getVersion(absolutePackageDir);

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
    .version(version)
    .demandCommand(1, 'You must specify a command')
    .strict()
    .recommendCommands();

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
      demandOption: false,
    },
    'ignore-files': {
      alias: 'i',
      describe: 'A list of glob patterns to define which files should be ' +
                'ignored. (Example: --ignore-files=path/to/first.js ' +
                'path/to/second.js "**/*.log")',
      demandOption: false,
      // The following option prevents yargs>=11 from parsing multiple values,
      // so the minimum value requirement is enforced in execute instead.
      // Upstream bug: https://github.com/yargs/yargs/issues/1098
      // requiresArg: true,
      type: 'array',
    },
    'no-input': {
      describe: 'Disable all features that require standard input',
      type: 'boolean',
      demandOption: false,
    },
    'config': {
      alias: 'c',
      describe: 'Path to a CommonJS config file to set ' +
        'option defaults',
      default: undefined,
      demandOption: false,
      requiresArg: true,
      type: 'string',
    },
    'config-discovery': {
      describe: 'Discover config files in home directory and ' +
        'working directory. Disable with --no-config-discovery.',
      demandOption: false,
      default: true,
      type: 'boolean',
    },
  });

  program
    .command(
      'build',
      'Create an extension package from source',
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
      'Sign the extension so it can be installed in Firefox',
      commands.sign, {
        'api-key': {
          describe: 'API key (JWT issuer) from addons.mozilla.org',
          demandOption: true,
          type: 'string',
        },
        'api-secret': {
          describe: 'API secret (JWT secret) from addons.mozilla.org',
          demandOption: true,
          type: 'string',
        },
        'api-url-prefix': {
          describe: 'Signing API URL prefix',
          default: 'https://addons.mozilla.org/api/v3',
          demandOption: true,
          type: 'string',
        },
        'api-proxy': {
          describe:
            'Use a proxy to access the signing API. ' +
            'Example: https://yourproxy:6000 ',
          demandOption: false,
          type: 'string',
        },
        'id': {
          describe:
            'A custom ID for the extension. This has no effect if the ' +
            'extension already declares an explicit ID in its manifest.',
          demandOption: false,
          type: 'string',
        },
        'timeout': {
          describe: 'Number of milliseconds to wait before giving up',
          type: 'number',
        },
        'channel': {
          describe: 'The channel for which to sign the addon. Either ' +
          '\'listed\' or \'unlisted\'',
          type: 'string',
        },
      })
    .command('run', 'Run the extension', commands.run, {
      'target': {
        alias: 't',
        describe: 'The extensions runners to enable. Specify this option ' +
                  'multiple times to run against multiple targets.',
        default: 'firefox-desktop',
        demandOption: false,
        type: 'array',
        choices: ['firefox-desktop', 'firefox-android', 'chromium'],
      },
      'firefox': {
        alias: ['f', 'firefox-binary'],
        describe: 'Path or alias to a Firefox executable such as firefox-bin ' +
                  'or firefox.exe. ' +
                  'If not specified, the default Firefox will be used. ' +
                  'You can specify the following aliases in lieu of a path: ' +
                  'firefox, beta, nightly, firefoxdeveloperedition.',
        demandOption: false,
        type: 'string',
      },
      'firefox-profile': {
        alias: 'p',
        describe: 'Run Firefox using a copy of this profile. The profile ' +
                  'can be specified as a directory or a name, such as one ' +
                  'you would see in the Profile Manager. If not specified, ' +
                  'a new temporary profile will be created.',
        demandOption: false,
        type: 'string',
      },
      'chromium-binary': {
        describe: 'Path or alias to a Chromium executable such as ' +
          'google-chrome, google-chrome.exe or opera.exe etc. ' +
          'If not specified, the default Google Chrome will be used.',
        demandOption: false,
        type: 'string',
      },
      'chromium-profile': {
        describe: 'Path to a custom Chromium profile',
        demandOption: false,
        type: 'string',
      },
      'keep-profile-changes': {
        describe: 'Run Firefox directly in custom profile. Any changes to ' +
                  'the profile will be saved.',
        demandOption: false,
        type: 'boolean',
      },
      'reload': {
        describe: 'Reload the extension when source files change.' +
          'Disable with --no-reload.',
        demandOption: false,
        default: true,
        type: 'boolean',
      },
      'watch-file': {
        describe: 'Reload the extension only when the contents of this' +
                  'file changes. This is useful if you use a custom' +
                  ' build process for your extension',
        demandOption: false,
        type: 'string',
      },
      'pre-install': {
        describe: 'Pre-install the extension into the profile before ' +
                  'startup. This is only needed to support older versions ' +
                  'of Firefox.',
        demandOption: false,
        type: 'boolean',
      },
      'pref': {
        describe: 'Launch firefox with a custom preference ' +
                  '(example: --pref=general.useragent.locale=fr-FR). ' +
                  'You can repeat this option to set more than one ' +
                  'preference.',
        demandOption: false,
        requiresArg: true,
        type: 'array',
        coerce: coerceCLICustomPreference,
      },
      'start-url': {
        alias: ['u', 'url'],
        describe: 'Launch firefox at specified page',
        demandOption: false,
        type: 'array',
      },
      'browser-console': {
        alias: ['bc'],
        describe: 'Open the DevTools Browser Console.',
        demandOption: false,
        type: 'boolean',
      },
      'args': {
        alias: ['arg'],
        describe: 'Additional CLI options passed to the Browser binary',
        demandOption: false,
        type: 'array',
      },
      // Firefox for Android CLI options.
      'adb-bin': {
        describe: 'Specify a custom path to the adb binary',
        demandOption: false,
        type: 'string',
        requiresArg: true,
      },
      'adb-host': {
        describe: 'Connect to adb on the specified host',
        demandOption: false,
        type: 'string',
        requiresArg: true,
      },
      'adb-port': {
        describe: 'Connect to adb on the specified port',
        demandOption: false,
        type: 'string',
        requiresArg: true,
      },
      'adb-device': {
        alias: ['android-device'],
        describe: 'Connect to the specified adb device name',
        demandOption: false,
        type: 'string',
        requiresArg: true,
      },
      'adb-discovery-timeout': {
        describe: 'Number of milliseconds to wait before giving up',
        demandOption: false,
        type: 'number',
        requiresArg: true,
      },
      'adb-clean-artifacts': {
        describe: 'Remove old artifact directories from the adb device',
        demandOption: false,
        type: 'boolean',
      },
      'firefox-apk': {
        describe: (
          'Run a specific Firefox for Android APK. ' +
          'Example: org.mozilla.fennec_aurora'
        ),
        demandOption: false,
        type: 'string',
        requiresArg: true,
      },
      'firefox-apk-component': {
        describe:
          'Run a specific Android Component (defaults to <firefox-apk>/.App)',
        demandOption: false,
        type: 'string',
        requiresArg: true,
      },
    })
    .command('lint', 'Validate the extension source', commands.lint, {
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

  return program.execute({getVersion, ...runOptions});
}

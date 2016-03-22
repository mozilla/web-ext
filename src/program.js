/* @flow */
import path from 'path';
import {readFileSync} from 'fs';
import yargs from 'yargs';

import defaultCommands from './cmd';
import {WebExtError} from './errors';


/*
 * The command line program.
 */
export class Program {
  yargs: any;
  commands: { [key: string]: Function };

  constructor(argv: ?Array<string>, {yargsInstance=yargs}: Object = {}) {
    if (argv !== undefined) {
      // This allows us to override the process argv which is useful for
      // testing.
      yargsInstance = yargs(argv);
    }
    this.yargs = yargsInstance;
    this.commands = {};
  }

  command(name: string, description: string, executor: Function,
          commandOptions: ?Object): Program {
    this.yargs.command(name, description, (yargs) => {
      if (!commandOptions) {
        return;
      }
      return yargs.options(commandOptions);
    });
    this.commands[name] = executor;
    return this;
  }

  setGlobalOptions(options: Object): Program {
    // This is a convenience for setting global options.
    // An option is only global (i.e. available to all sub commands)
    // with the `global` flag so this makes sure every option has it.
    Object.keys(options).forEach((key) => {
      options[key].global = true;
    });
    this.yargs.options(options);
    return this;
  }

  run({throwError=false, systemProcess=process}: Object = {}): Promise {
    let argv = this.yargs.argv;
    let cmd = argv._[0];
    return new Promise(
      (resolve) => {
        if (cmd === undefined) {
          throw new WebExtError('No sub-command was specified in the args');
        }
        let runCommand = this.commands[cmd];
        if (!runCommand) {
          throw new WebExtError(`unknown command: ${cmd}`);
        }
        resolve(runCommand);
      })
      .then((runCommand) => runCommand(argv))
      .catch((error) => {
        let prefix = '';
        if (cmd) {
          prefix = `${cmd}: `;
        }

        console.error(`\n${prefix}${error.stack}\n`);
        if (error.code) {
          console.error(`${prefix}Error code: ${error.code}\n`);
        }

        if (throwError) {
          throw error;
        } else {
          systemProcess.exit(1);
        }
      });
  }
}


export function version(absolutePackageDir: string): string {
  let packageData: any = readFileSync(
    path.join(absolutePackageDir, 'package.json'));
  return JSON.parse(packageData).version;
}


export function main(
    absolutePackageDir: string,
    {commands=defaultCommands, argv, runOptions={}}: Object = {}): Promise {
  let program = new Program(argv);
  // yargs uses magic camel case expansion to expose options on the
  // final argv object. For example, the 'build-dir' option is alternatively
  // available as argv.buildDir.
  program.yargs
    .usage(`Usage: $0 [options] command

Option values can also be set by declaring an environment variable prefixed
with \$WEB_EXT_. For example: $WEB_EXT_SOURCE_DIR=/path is the same as
--source-dir=/path.

To view specific help for any given command, add the command name.
Example: $0 --help run.
`)
    .help('help')
    .alias('h', 'help')
    .env('WEB_EXT')
    .version(() => version(absolutePackageDir));

  program.setGlobalOptions({
    'source-dir': {
      alias: 's',
      describe: 'Web extension source directory.',
      default: process.cwd(),
      requiresArg: true,
      demand: true,
      type: 'string',
    },
  });

  program
    .command('build', 'Create a web extension package from source',
             commands.build, {
      'build-dir': {
        alias: 'b',
        describe: 'Directory where built artifacts will be saved.',
        default: path.join(process.cwd(), 'web-ext-build'),
        requiresArg: true,
        demand: true,
        type: 'string',
      },
    })
    .command('run', 'Run the web extension', commands.run, {
      'firefox-binary': {
        describe: 'Path to a Firefox executable such as firefox-bin. ' +
                  'If not specified, the default Firefox will be used.',
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
    });

  return program.run(runOptions);
}

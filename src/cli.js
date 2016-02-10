/* @flow */
import path from 'path';
import {readFileSync} from 'fs';
import yargs from 'yargs';

import build from './build';


export class Program {
  yargs: any;
  commands: { [key: string]: Function };

  constructor(argv: ?Array<string>) {
    if (argv !== undefined) {
      this.yargs = yargs(argv);
    } else {
      this.yargs = yargs;
    }
    this.commands = {};
  }

  command(name: string, description: string, executor: Function,
          configureCommand: ?Function): Program {
    this.yargs.command(name, description, configureCommand);
    this.commands[name] = executor;
    return this;
  }

  run(): Promise {
    let argv = this.yargs.argv;
    let cmd = argv._[0];
    return new Promise(
      (resolve) => {
        if (cmd === undefined) {
          throw new Error('No sub-command was specified in the args');
        }
        if (!this.commands[cmd]) {
          throw new Error(`unknown command: ${cmd}`);
        }
        resolve();
      })
      .then(() => this.commands[cmd](argv))
      .catch((error) => {
        let prefix = 'error:';
        if (cmd) {
          prefix = `${cmd} ${prefix}`;
        }
        console.error(prefix, error);
        throw error;
      });
  }
}


export function main() {
  let program = new Program();
  program.yargs
    .usage('Usage: $0 [options]')
    .help('help')
    .alias('h', 'help')
    .env('WEB_EXT')
    .option('s', {
      alias: 'source-dir',
      describe: 'Web extension source directory.',
      default: process.cwd(),
      requiresArg: true,
      demand: true,
      type: 'string',
    })
    .option('b', {
      alias: 'build-dir',
      describe: 'Directory where built artifacts will be saved.',
      default: path.join(process.cwd(), 'web-ext-build'),
      requiresArg: true,
      demand: true,
      type: 'string',
    })
    .version(() => {
      let packageData: any = readFileSync(
        path.join(__dirname, '..', 'package.json'));
      return JSON.parse(packageData).version;
    });

  program
    .command('build', 'Create a web extension package from source', build);

  program.run();
}

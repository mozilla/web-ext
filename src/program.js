/* @flow */
import yargs from 'yargs';


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

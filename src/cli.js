/* @flow */
import path from 'path';
import {readFileSync} from 'fs';

import build from './build';
import {Program} from './program';


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

/* @flow */
import path from 'path';
import {readFileSync} from 'fs';

import build from './cmd/build';
import run from './cmd/run';
import {Program} from './program';


export function main(absolutePackageDir: string) {
  let program = new Program();
  // yargs uses magic camel case expansion to expose options on the
  // final argv object. For example, the 'build-dir' option is available
  // as argv.buildDir.
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
        path.join(absolutePackageDir, 'package.json'));
      return JSON.parse(packageData).version;
    });

  program
    .command('build', 'Create a web extension package from source', build)
    .command('run', 'Run the web extension', run);

  program.run();
}

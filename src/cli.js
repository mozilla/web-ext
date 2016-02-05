/* @flow */
import path from 'path';
import {readFileSync} from 'fs';
import yargs from 'yargs';


export function main() {
  yargs
    .usage('Usage: $0 [options]')
    .help('help')
    .alias('h', 'help')
    .version(() => {
      let packageData: any = readFileSync(
        path.join(__dirname, '..', 'package.json'));
      return JSON.parse(packageData).version;
    })
    .argv;
}

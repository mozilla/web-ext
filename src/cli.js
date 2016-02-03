import path from 'path';
import {readFileSync} from 'fs';
import yargs from 'yargs';


export function main() {
  return yargs
    .usage('Usage: $0 [options]')
    .help('help')
    .alias('h', 'help')
    .version(() => JSON.parse(
      readFileSync(path.join(__dirname, '..', 'package.json'))).version)
    .argv;
}

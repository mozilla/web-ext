/* @flow */
import path from 'path';
import readline from 'readline';
import tty from 'tty';

import {fs} from 'mz';
import mkdirp from 'mkdirp';
import promisify from 'es6-promisify';

import {createLogger} from '../util/logger';
import {UsageError, isErrorWithCode} from '../errors';

const log = createLogger(__filename);
const defaultAsyncMkdirp = promisify(mkdirp);

export type CreateParams = {|
  name: string,
  pause?: typeof process.stdin.pause,
|};

export default async function create(
  {
    name,
    pause = process.stdin.pause,
  }: CreateParams
): Promise<void> {
  const targetPath = path.join(process.cwd(), name);
  log.info(targetPath);

  let userAbort = true;

  try {
    const stats = await fs.stat(targetPath);
    if (stats.isDirectory()) {
      if (process.stdin.isTTY &&
         (process.stdin instanceof tty.ReadStream)) {
        process.stdin.setRawMode(true);
        readline.emitKeypressEvents(process.stdin);

        while (true) {
          log.info(`The ${targetPath} already exists. Are you sure you want ` +
                   'to use this directory and overwrite existing files? Y/N');

          const pressed = await new Promise((resolve) => {
            process.stdin.once('keypress', (str, key) => resolve(key));
          });

          if (pressed.name === 'n' || (pressed.ctrl && pressed.name === 'c')) {
            break;
          } else if (pressed.name === 'y') {
            userAbort = false;
            break;
          }
        }
      } else {
        throw new UsageError('Target dir already exist, overwrite is not ' +
                             'allowed without user confirmation.');
      }
    }

    if (userAbort) {
      log.info('User aborted the command.');
      pause();
      return;
    }

    return await createFiles(name, targetPath).then(() => {
      pause();
    });
  } catch (statErr) {
    if (!isErrorWithCode('ENOENT', statErr)) {
      throw statErr;
    } else {
      try {
        await defaultAsyncMkdirp(targetPath);
        await createFiles(name, targetPath);
      } catch (mkdirErr) {
        throw mkdirErr;
      }
    }
  }
}

async function createFiles(name, targetPath): Promise<void> {
  log.info('Creating manifest file');
  const generatedManifest = await generateManifest(name);
  const json = JSON.stringify(generatedManifest, null, 2);
  try {
    log.info('Writing files');
    await fs.writeFile(path.join(targetPath, 'manifest.json'), json, 'utf8');
    await fs.open(path.join(targetPath, 'background.js'), 'w');
    await fs.open(path.join(targetPath, 'content.js'), 'w');
  } catch (error) {
    throw error;
  }
  return;
}

async function generateManifest(title) {
  return {
    manifest_version: 2,
    name: `${title} (name)`,
    description: `${title} (description)`,
    version: 0.1,
    default_locale: 'en',
    icons: {
      '48': 'icon.png',
      '96': 'icon@2x.png',
    },
    browser_action: {
      default_title: `${title} (browserAction)`,
      default_icon: {
        '19': 'button/button-19.png',
        '38': 'button/button-38.png',
      },
    },
    background: {
      scripts: ['background.js'],
      page: '',
    },
    content_scripts: [
      {
        exclude_matches: [],
        matches: [],
        js: ['content.js'],
      },
    ],
    permissions: [],
  };
}

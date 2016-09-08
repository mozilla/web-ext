/* @flow */
import {spawn} from 'child_process';
import {describe, it} from 'mocha';

import {
  webExt, addonPath, fakeFirefoxPath,
} from './common';

const EXPECTED_MESSAGE = 'Fake Firefox binary executed correctly.';

describe('web-ext run', () => {
  it('webext run --source-dir SRCDIR --no-reload --firefox FXPATH', () => {
    return new Promise((resolve, reject) => {
      const webextProcess = spawn(webExt, [
        'run', '--verbose', '--no-reload',
        '--source-dir', addonPath,
        '--firefox', fakeFirefoxPath,
      ], {
        env: {
          PATH: process.env.PATH,
          EXPECTED_MESSAGE: EXPECTED_MESSAGE,
          addonPath: addonPath,
        },
      });

      let errorData = '';
      webextProcess.stderr.on('data', (data) => {
        errorData += data;
      });

      let outputData = '';
      webextProcess.stdout.on('data', (data) => {
        outputData += data;
      });

      webextProcess.on('close', (code) => {
        if (outputData.indexOf(EXPECTED_MESSAGE) < 0) {
          reject(
            new Error(
              `The fake Firefox binary has not been executed: ${errorData}`
            )
          );
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(errorData));
        }
      });
    });
  });
});

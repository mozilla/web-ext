/* @flow */
import {spawn} from 'child_process';
import {describe, it} from 'mocha';

import {webExt, addonPath} from './common';

describe('web-ext lint', () => {
  it('webext lint --source-dir SRCDIR', () => {
    return new Promise((resolve, reject) => {
      const webextProcess = spawn(webExt, [
        'lint',
        '--source-dir', addonPath,
      ]);

      let errorData = '';
      webextProcess.stderr.on('data', (data) => {
        errorData += data;
      });

      webextProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(errorData));
        }
      });
    });
  });
});

/* @flow */
import {spawn} from 'child_process';
import {describe, it} from 'mocha';

import {
  webExt, addonPath, artifactsPath,
} from './common';

describe('web-ext build', () => {
  it('webext build --source-dir SRCDIR --artifacts-dir OUTDIR', () => {
    return new Promise((resolve, reject) => {
      const webextProcess = spawn(webExt, [
        'build',
        '--source-dir', addonPath,
        '--artifacts-dir', artifactsPath,
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

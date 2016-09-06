/* @flow */
import {spawn} from 'child_process';
import {describe, it} from 'mocha';

import {webExt} from './common';

describe('web-ext', () => {
  it('webext --help should complete successfully', () => {
    return new Promise((resolve, reject) => {
      const webextProcess = spawn(webExt, ['--help']);

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

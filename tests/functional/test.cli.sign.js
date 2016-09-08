/* @flow */
import {spawn} from 'child_process';
import {describe, it} from 'mocha';

import {
  webExt, addonPath, artifactsPath, fakeServerPath,
} from './common';

describe('web-ext sign', () => {
  it('webext lint --source-dir SRCDIR', () => {
    return new Promise((resolve, reject) => {
      const fakeServerProcess = spawn(fakeServerPath);

      const webextProcess = spawn(webExt, [
        'sign', '--verbose',
        '--api-url-prefix', 'http://localhost:8989/fake/api/v3',
        '--api-key', 'FAKEAPIKEY', '--api-secret', 'FAKEAPISECRET',
        '--source-dir', addonPath,
        '--artifacts-dir', artifactsPath,
      ]);

      let errorData = '';
      webextProcess.stderr.on('data', (data) => {
        errorData += data;
      });

      webextProcess.on('close', (code) => {
        fakeServerProcess.kill();

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(errorData));
        }
      });
    });
  });
});

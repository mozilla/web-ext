/* @flow */
import open from 'open';

import {createLogger} from '../util/logger';

const log = createLogger(__filename);

export type DocsParams = {
  noInput?: boolean,
  shouldExitProgram?: boolean,
}

export type DocsOptions = {
  openUrl?: typeof open,
}

// eslint-disable-next-line max-len
export const url = 'https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/';

export default function docs(
  params: DocsParams, {openUrl = open}: DocsOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    openUrl(url, (error) => {
      if (error) {
        log.debug(`Encountered an error while opening URL ${url}`, error);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

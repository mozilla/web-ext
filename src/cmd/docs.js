/* @flow */
import opn from 'opn';

import {createLogger} from '../util/logger';

const log = createLogger(__filename);

export type DocsParams = {
  noInput?: boolean,
  shouldExitProgram?: boolean,
}

export type DocsOptions = {
  openUrl?: typeof opn,
}

export const url = 'https://developer.mozilla.org/en-US/Add-ons' +
  '/WebExtensions/Getting_started_with_web-ext';

export default function docs(
  params: DocsParams, {openUrl = opn}: DocsOptions = {}
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

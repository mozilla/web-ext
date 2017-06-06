/* @flow */
import defaultUrlOpener from 'open';

import {createLogger} from '../util/logger';

const log = createLogger(__filename);

type DocsOptions = {
  openUrl?: typeof defaultUrlOpener,
  shouldExitProgram?: boolean,
}

export const url = 'https://developer.mozilla.org/en-US/Add-ons' +
  '/WebExtensions/Getting_started_with_web-ext';

export default function docs(
  params: Object, {openUrl = defaultUrlOpener}: DocsOptions = {}
) {
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

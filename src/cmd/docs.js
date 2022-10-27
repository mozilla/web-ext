/* @flow */
import open from 'open';

import { createLogger } from '../util/logger.js';

const log = createLogger(import.meta.url);

export type DocsParams = {
  noInput?: boolean,
  shouldExitProgram?: boolean,
};

export type DocsOptions = {
  openUrl?: typeof open,
};

// eslint-disable-next-line max-len
export const url =
  'https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/';

export default async function docs(
  params: DocsParams,
  { openUrl = open }: DocsOptions = {}
): Promise<void> {
  try {
    await openUrl(url);
  } catch (error) {
    log.debug(`Encountered an error while opening URL ${url}`, error);
    throw error;
  }
}

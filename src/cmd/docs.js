/* @flow */
import open from 'open';

export const openDocs = {
  openURL: open,
};

export default function docs() {
  return openDocs.openURL('https://developer.mozilla.org/en-US/Add-ons' +
       '/WebExtensions/Getting_started_with_web-ext');
}


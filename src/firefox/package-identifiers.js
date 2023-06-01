// This list should have more specific identifiers listed first because of the
// logic in `src/util/adb.js`, e.g. `some.id.debug` is more specific than `some.id`.
export default [
  'org.mozilla.fennec',
  'org.mozilla.fenix.debug',
  'org.mozilla.fenix',
  'org.mozilla.geckoview_example',
  'org.mozilla.geckoview',
  'org.mozilla.firefox',
  'org.mozilla.reference.browser',
];

export const defaultApkComponents = {
  'org.mozilla.reference.browser': '.BrowserActivity',
};

/* globals chrome */

chrome.runtime.onInstalled.addListener(() => {
  // Although this URL is hard-coded, it is easy to set up a test server with a
  // random port, and let Chrome resolve this host to that local server with:
  // --host-resolver-rules='MAP localhost:1337 localhost:12345'
  // (where 12345 is the actual port of the local server)
  //
  // We are intentionally using localhost instead of another domain, to make
  // sure that the browser does not upgrade the http:-request to https.
  chrome.tabs.create({ url: 'http://localhost:1337/hello_from_extension' });
});

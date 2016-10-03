/* @flow */
let http = require('http');
let https = require('https');

/**
 * Fetch a file from a given url
 * Returns a promise resolving to a tuple of [body, statusCode]
 * Will throw an error on connection errors
 */
export function httpFetchFile(url: string): Promise<[string, number]> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const request = lib.get(url, (response) => {
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => resolve([body.join(''), response.statusCode]));
    });
    request.on('error', (err) => reject(err));
  });
}

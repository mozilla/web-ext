/* @flow */
import FirefoxProfile from 'firefox-profile';
import promisify from 'es6-promisify';

export const finderGetPath = promisify(FirefoxProfile.Finder.getPath);

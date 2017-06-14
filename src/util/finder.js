/* @flow */
import FirefoxProfile from 'firefox-profile';
import promisify from 'es6-promisify';

var finder = new FirefoxProfile.Finder;
export const finderGetPath = promisify(finder.getPath.bind(finder));

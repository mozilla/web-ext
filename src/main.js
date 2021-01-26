/* @flow */
import {main} from './program';
import cmd from './cmd';
import * as logger from './util/logger';

// This only exposes util/logger and a subset of util/adb so far.
// Do we need anything else?
const util = {
  logger,
  // Lazy load the adb module when util.adb is accessed for the first time, to defer loading
  // the npm dependencies used by the adb module to when actually needed.
  // This is being done to continue the courtesy of web-ext issue #1301
  get adb(): Object {
    const {listADBDevices, listADBFirefoxAPKs} = require('./util/adb');
    return {listADBDevices, listADBFirefoxAPKs};
  },
};

export default {main, cmd, util};

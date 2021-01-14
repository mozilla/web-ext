/* @flow */
import {main} from './program';
import cmd from './cmd';
import * as logger from './util/logger';

// This only exposes util/logger and a couple of functions from util/adb so far.
// Do we need anything else?
const util = {
  logger,
  get adb() {
    const {listADBDevices, listADBFirefoxAPKs} = require('./util/adb.js');
    return {listADBDevices, listADBFirefoxAPKs};
  },
};

export default {main, cmd, util};

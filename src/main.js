/* @flow */
import {main} from './program';
import cmd from './cmd';
import * as logger from './util/logger';
import {listADBDevices, listADBFirefoxAPKs} from './util/adb';

// This only exposes util/logger so far.
// Do we need anything else?
const util = {logger, listADBDevices, listADBFirefoxAPKs};

export default {main, cmd, util};

/* @flow */
import {main} from './program';
import cmd from './cmd';
import * as logger from './util/logger';

// This only exposes util/logger so far.
// Do we need anything else?
const util = {logger};

export default {main, cmd, util};

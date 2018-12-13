/* @flow */

import type {Readable} from 'stream';

export function isTTY(stream: Readable): boolean {
  // $FLOW_FIXME: flow complains that stream may not provide isTTY as a property.
  return stream.isTTY;
}

export function setRawMode(stream: Readable, rawMode: boolean) {
  // $FLOW_FIXME: flow complains that stdin may not provide setRawMode.
  stream.setRawMode(rawMode);
}

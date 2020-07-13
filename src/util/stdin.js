/* @flow */

import type {Readable} from 'stream';

export function isTTY(stream: Readable): boolean {
  // $FlowFixMe: flow complains that stream may not provide isTTY as a property.
  return stream.isTTY;
}

export function setRawMode(stream: Readable, rawMode: boolean) {
  // $FlowFixMe: flow complains that stdin may not provide setRawMode.
  stream.setRawMode(rawMode);
}

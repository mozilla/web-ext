export function isTTY(stream) {
  // $FlowFixMe: flow complains that stream may not provide isTTY as a property.
  return stream.isTTY;
}

export function setRawMode(stream, rawMode) {
  // $FlowFixMe: flow complains that stdin may not provide setRawMode.
  stream.setRawMode(rawMode);
}

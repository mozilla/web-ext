export function isTTY(stream) {
  return stream.isTTY;
}

export function setRawMode(stream, rawMode) {
  stream.setRawMode(rawMode);
}

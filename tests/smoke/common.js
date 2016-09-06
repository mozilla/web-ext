import path from 'path';

export const smokeTestsDir = path.resolve(__dirname);

export const projectDir = path.join(smokeTestsDir, '..', '..');

export const webExt = path.join(projectDir, 'bin', 'web-ext');

export const fixturesDir = path.join(smokeTestsDir, '..', 'fixtures');

export const addonPath = path.join(fixturesDir, 'minimal-web-ext');

export const artifactsPath = path.join(projectDir, 'artifacts');

export const fakeFirefoxPath = path.join(
  smokeTestsDir, 'fake-firefox-binary.js'
);

export const fakeServerPath = path.join(smokeTestsDir, 'fake-amo-server.js');

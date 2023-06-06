#!/usr/bin/env node

import path from 'path';

import Watchpack from 'watchpack';
import notifier from 'node-notifier';

import config from './lib/config.js';
import eslint from './lib/eslint.js';
import { mochaUnit, mochaFunctional } from './lib/mocha.js';
import babel from './lib/babel.js';

const COVERAGE =
  process.argv.includes('--coverage') || process.env.COVERAGE === 'y';

const wp = new Watchpack();
wp.watch(config.watch.files, config.watch.dirs);

function notify(message) {
  notifier.notify({ title: 'web-ext develop: ', message });
}

let changed = new Set();

async function runTasks(changes) {
  const changesDetected = `\nChanges detected. ${changes
    .slice(0, 5)
    .join(' ')}...`;
  console.log(changesDetected);
  notify(changesDetected);

  console.log('\nRunning eslint checks');
  if (!eslint()) {
    notify('eslint errors');
    return;
  }

  console.log('\nRunning unit tests');
  if (!mochaUnit({}, COVERAGE)) {
    notify('mocha unit tests errors');
    return;
  }

  console.log('\nBuilding web-ext');
  if (!babel()) {
    notify('babel build errors');
    return;
  }

  console.log('\nRunning functional tests');
  if (!mochaFunctional()) {
    notify('mocha functional tests errors');
    return;
  }
}

wp.on('change', (changedFile, mtime) => {
  if (mtime === null) {
    changed.delete(changedFile);
  } else {
    changed.add(changedFile);
  }
});

wp.on('aggregated', async () => {
  // Filter out files that start with a dot from detected changes
  // (as they are hidden files or temp files created by an editor).
  const changes = Array.from(changed).filter((filePath) => {
    return !path.basename(filePath).startsWith('.');
  });
  changed = new Set();

  if (changes.length === 0) {
    return;
  }

  await runTasks(changes);

  console.log('\nDone. Waiting for changes...');
});

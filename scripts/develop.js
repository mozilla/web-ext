#!/usr/bin/env node

const path = require('path');

const Watchpack = require('watchpack');
const notifier = require('node-notifier');

const config = require('./lib/config');
const eslint = require('./lib/eslint');
const {flowStatus} = require('./lib/flow');
const {mochaUnit, mochaFunctional} = require('./lib/mocha');
const webpack = require('./lib/webpack');

const COVERAGE = process.argv.includes('--coverage') || process.env.COVERAGE === 'y';

console.log('Starting flow server...');
if (!flowStatus()) {
  process.exit(1);
}

const wp = new Watchpack();
wp.watch(config.watch.files, config.watch.dirs);

function notify(message) {
  notifier.notify({title: 'web-ext develop: ', message});
}

let changed = new Set();

async function runTasks(changes) {
  const changesDetected = `\nChanges detected. ${changes.slice(0, 5).join(' ')}...`;
  console.log(changesDetected);
  notify(changesDetected);

  console.log('\nRunning flow checks');
  if (!flowStatus()) {
    notify('flow check errors');
    return;
  }

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

  console.log('\nBuilding web-ext webpack bundle');
  const webpackSuccess = await webpack().then(() => true, () => false);

  if (!webpackSuccess) {
    notify('webpack build errors');
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

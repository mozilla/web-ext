#!/usr/bin/env node

import shell from 'shelljs';

import config from './lib/config.js';
import babel from './lib/babel.js';

shell.set('-e');

shell.echo('Clean dist files...');
shell.rm('-rf', config.clean);

shell.echo('Running babel-cli...');
process.env.WEBEXT_BUILD_ENV = process.env.NODE_ENV || 'development';
babel();
shell.echo('babel build completed.');

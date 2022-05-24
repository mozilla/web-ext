#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';

import webExt from '../lib/main.js';

const absolutePackageDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

await webExt.main(absolutePackageDir);

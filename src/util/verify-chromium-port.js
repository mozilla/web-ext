import { createServer } from 'node:http';
import { exec } from 'node:child_process';

import { createLogger } from './logger.js';
import { UnusablePortError, UsageError } from '../errors.js';

const log = createLogger(import.meta.url);

/**
 * Returns a random, available port
 * @returns {number} Available port number to use;
 */
export async function getRandomPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('listening', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.once('error', () => reject);
    server.listen(0);
  });
}

/**
 * Search for existing process
 * @param {string} chromeBinary
 * @returns {Promise<string>} Process list output
 */
async function findProcess(chromeBinary) {
  const platform = process.platform;
  let cmd = '';

  switch (platform) {
    case 'freebsd':
      // no dash
      cmd = 'ps axo cmd';
      break;
    case 'darwin':
      cmd = 'ps -axo cmd';
      break;
    case 'linux':
      // dash
      cmd = 'ps -Ao cmd';
      cmd = `${cmd} | grep ${chromeBinary}`;
      break;
    case 'win32':
      cmd = `powershell "Get-CimInstance Win32_Process -Filter \\"Name -Like '${chromeBinary}'\\" | Select CommandLine"`;
      break;
    default:
      throw new UsageError('Unsupported platform');
  }

  // log.info('Searching for process %s', chromeBinary);
  // log.debug('(cmd: %s)', cmd);

  const promise = new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      // log.debug('Output: %s', stdout);
      if (stderr) {
        log.debug('Error: %s', stderr);
      }

      // const isMatch =
      // stdout.toLowerCase().indexOf(chromeBinary.toLowerCase()) > -1;

      if (error) {
        reject(error);
      } else {
        // log.debug('Found at least one instance of %s', chromeBinary);
        // log.debug('(result: %o)', isMatch);
        resolve(stdout);
      }
    });
  });

  return promise;
}

/**
 * Inspect process list output and match against specified port and extension
 * @param {number} port User-requested port
 * @param {string} extension Web-ext temporary extension
 * @param {string} output Output from OS-specific process list containing process command line
 * @returns {Promise<boolean>} Whether an eligible instance was found
 */
async function inspectProcessList(port, extension, output) {
  if (!output) {
    log.info('Browser instance not found');
    return false;
  }
  const lines = output.split('\n');
  let foundEligibleInstance = false;

  // log.debug('Found %d browser instance(s).  Inspecting...', lines.length);

  lines.forEach((line) => {
    const extensionMatch = `--load-extension=${extension}`;
    const portMatch = `--remote-debugging-port=${port}`;

    const isPortMatch = line.toLowerCase().indexOf(portMatch) > -1;
    const isExtension = line.indexOf(extensionMatch) > -1;

    if (!isPortMatch) {
      // log.debug('[%d/%d] Not using target port', i, lines.length, port);
      return;
    }

    // log.debug('[%d/%d] Found chromium instance', i, lines.length);

    if (!isExtension) {
      // throw new UnusablePortError(
      //   'Port is in use by another browser instance that does not have this extension loaded',
      // );
      // log.debug('[%d/%d] Extension not loaded', i, lines.length);
      return;
    }

    // log.debug(
    //   '[%d/%d] Found extension loaded in this instance',
    //   i,
    //   lines.length,
    // );
    foundEligibleInstance = true;
  });

  // log.debug('Inspection complete.  Result: %o', foundEligibleInstance);
  return foundEligibleInstance;
}

/**
 * Determine if a port is available
 * @param {number} port Port to test
 * */
export async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.once('error', () => resolve(false));
    server.listen(port);
  });
}

/**
 * Validate user-supplied port to ensure it is suitable for use
 * @param {number} port User-supplied port request
 * @param {string} chromeBinary Chromium binary being requested for launch
 * @param {string[]} chromeFlags Array of flags requested for launch
 * @returns {boolean} Whether requested port is usable
 */
export async function validatePort(port, chromeBinary, chromeFlags) {
  if (!port) {
    return;
  }
  if (isNaN(port)) {
    throw new UnusablePortError(`Non-numeric port provided (${port})`);
  }
  if (port < 0 || port > 65535) {
    throw new UnusablePortError(`Invalid port number: ${port}`);
  }

  const isAvailable = await portAvailable(port);
  // const flags = new Map();
  const extensions = chromeFlags.find(
    (flag) => flag.toLowerCase().indexOf('--load-extension') > -1,
  );
  if (!extensions.length || !extensions.length > 1) {
    // This shouldn't happen...
    throw new UnusablePortError(
      'Port is in use and verification of whether the extension is loaded failed',
    );
  }

  const extension = extensions[0].substring(extensions[0].indexOf('=') + 1);

  if (!extension) {
    // This also shouldn't happen...
    throw new UnusablePortError(
      'Port is in use and verification of whether the extension is loaded failed',
    );
  }
  // chromeFlags.forEach((flag) => {
  //   const valueAt = flag.indexOf('=');
  //   const [key, value] =
  //     valueAt === -1
  //       ? [flag, undefined]
  //       : [flag.substring(0, valueAt), flag.substring(valueAt + 1)];

  //   // let key;
  //   // let value;
  //   // if (valueAt === -1) {
  //   //   key = flag;
  //   //   log.debug('flag: [%s]', key);
  //   // } else {
  //   //   key = flag.substring(0, valueAt);
  //   //   value = flag.substring(valueAt + 1);
  //   //   log.debug('flag: [%s] => %s', key, value);
  //   // }
  //   flags.set(key, value);
  // });

  // const extension = flags.get('--load-extension');

  if (isAvailable) {
    // log.debug('Using debugging port: %d', port);
    return true;
  }

  return findProcess(chromeBinary, port)
    .then((ps) => inspectProcessList(port, extension, ps))
    .catch((error) => {
      log.error(error);
      throw new UnusablePortError(`Unable to validate port: ${error}`);
    });
}

import path from 'path';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';

import parseJSON from 'parse-json';
import stripBom from 'strip-bom';
import defaultFromEvent from 'promise-toolbox/fromEvent';
import JSZip from 'jszip';

import defaultSourceWatcher from '../watcher.js';
import getValidatedManifest, { getManifestId } from '../util/manifest.js';
import { prepareArtifactsDir } from '../util/artifacts.js';
import { createLogger } from '../util/logger.js';
import { UsageError, isErrorWithCode } from '../errors.js';
import { createFileFilter as defaultFileFilterCreator } from '../util/file-filter.js';

const log = createLogger(import.meta.url);
const DEFAULT_FILENAME_TEMPLATE = '{name}-{version}.zip';

// 1980-01-01 UTC — the earliest timestamp representable in a ZIP entry.
const ZIP_EPOCH_SECONDS = 315532800;

// Build a ZIP buffer with deterministic byte output: entries are sorted
// alphabetically, and every entry's timestamp is fixed (overridable via the
// SOURCE_DATE_EPOCH environment variable, per the Reproducible Builds spec).
export async function createDeterministicZip(sourceDir, { filter } = {}) {
  const epochSeconds = process.env.SOURCE_DATE_EPOCH
    ? Number(process.env.SOURCE_DATE_EPOCH)
    : ZIP_EPOCH_SECONDS;
  if (!Number.isFinite(epochSeconds)) {
    throw new UsageError(
      `Invalid SOURCE_DATE_EPOCH value: ${process.env.SOURCE_DATE_EPOCH}`,
    );
  }
  const fixedDate = new Date(epochSeconds * 1000);

  const resolvedRoot = path.resolve(sourceDir);
  const entries = [];

  async function walk(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      const stat = await fs.lstat(full);
      if (filter && !filter(full, stat)) {
        continue;
      }
      if (dirent.isDirectory()) {
        entries.push({ full, isDir: true });
        await walk(full);
      } else if (dirent.isFile()) {
        entries.push({ full, isDir: false });
      }
    }
  }
  await walk(resolvedRoot);

  const zip = new JSZip();
  for (const entry of entries) {
    // ZIP entries always use forward slashes, regardless of host OS.
    const relative = path
      .relative(resolvedRoot, entry.full)
      .split(path.sep)
      .join('/');
    // `createFolders: false` keeps JSZip from injecting parent-folder
    // entries with a current-time `Date()`. The walk above already emits
    // every directory explicitly, so we control all entry timestamps.
    if (entry.isDir) {
      zip.file(relative, null, {
        dir: true,
        date: fixedDate,
        createFolders: false,
      });
    } else {
      const data = await fs.readFile(entry.full);
      zip.file(relative, data, { date: fixedDate, createFolders: false });
    }
  }

  // platform: 'UNIX' fixes the external-attribute byte; without it JSZip
  // derives it from process.platform, which would make the same source
  // produce different bytes on Windows vs Linux.
  return zip.generateAsync({
    compression: 'DEFLATE',
    type: 'nodebuffer',
    platform: 'UNIX',
  });
}

export function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '_');
}

// defaultPackageCreator types and implementation.

// This defines the _locales/messages.json type. See:
// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Internationalization#Providing_localized_strings_in__locales

export async function getDefaultLocalizedName({ messageFile, manifestData }) {
  let messageData;
  let messageContents;
  let extensionName = manifestData.name;

  try {
    messageContents = await fs.readFile(messageFile, { encoding: 'utf-8' });
  } catch (error) {
    throw new UsageError(
      `Error reading messages.json file at ${messageFile}: ${error}`,
    );
  }

  messageContents = stripBom(messageContents);

  const { default: stripJsonComments } = await import('strip-json-comments');
  try {
    messageData = parseJSON(stripJsonComments(messageContents));
  } catch (error) {
    throw new UsageError(
      `Error parsing messages.json file at ${messageFile}: ${error}`,
    );
  }

  extensionName = manifestData.name.replace(
    /__MSG_([A-Za-z0-9@_]+?)__/g,
    (match, messageName) => {
      if (!(messageData[messageName] && messageData[messageName].message)) {
        const error = new UsageError(
          `The locale file ${messageFile} ` + `is missing key: ${messageName}`,
        );
        throw error;
      } else {
        return messageData[messageName].message;
      }
    },
  );
  return Promise.resolve(extensionName);
}

// https://stackoverflow.com/a/22129960
export function getStringPropertyValue(prop, obj) {
  const properties = prop.split('.');
  const value = properties.reduce((prev, curr) => prev && prev[curr], obj);
  if (!['string', 'number'].includes(typeof value)) {
    throw new UsageError(
      `Manifest key "${prop}" is missing or has an invalid type: ${value}`,
    );
  }
  const stringValue = `${value}`;
  if (!stringValue.length) {
    throw new UsageError(`Manifest key "${prop}" value is an empty string`);
  }
  return stringValue;
}

function getPackageNameFromTemplate(filenameTemplate, manifestData) {
  const packageName = filenameTemplate.replace(
    /{([A-Za-z0-9._]+?)}/g,
    (match, manifestProperty) => {
      return safeFileName(
        getStringPropertyValue(manifestProperty, manifestData),
      );
    },
  );

  // Validate the resulting packageName string, after interpolating the manifest property
  // specified in the template string.
  const parsed = path.parse(packageName);
  if (parsed.dir) {
    throw new UsageError(
      `Invalid filename template "${filenameTemplate}". ` +
        `Filename "${packageName}" should not contain a path`,
    );
  }
  if (!['.zip', '.xpi'].includes(parsed.ext)) {
    throw new UsageError(
      `Invalid filename template "${filenameTemplate}". ` +
        `Filename "${packageName}" should have a zip or xpi extension`,
    );
  }

  return packageName;
}

export async function defaultPackageCreator(
  {
    manifestData,
    sourceDir,
    fileFilter,
    artifactsDir,
    overwriteDest,
    showReadyMessage,
    filename = DEFAULT_FILENAME_TEMPLATE,
  },
  { fromEvent = defaultFromEvent } = {},
) {
  let id;
  if (manifestData) {
    id = getManifestId(manifestData);
    log.debug(`Using manifest id=${id || '[not specified]'}`);
  } else {
    manifestData = await getValidatedManifest(sourceDir);
  }

  const buffer = await createDeterministicZip(sourceDir, {
    filter: (...args) => fileFilter.wantFile(...args),
  });

  let filenameTemplate = filename;

  let { default_locale } = manifestData;
  if (default_locale) {
    default_locale = default_locale.replace(/-/g, '_');
    const messageFile = path.join(
      sourceDir,
      '_locales',
      default_locale,
      'messages.json',
    );
    log.debug('Manifest declared default_locale, localizing extension name');
    const extensionName = await getDefaultLocalizedName({
      messageFile,
      manifestData,
    });
    // allow for a localized `{name}`, without mutating `manifestData`
    filenameTemplate = filenameTemplate.replace(/{name}/g, extensionName);
  }

  const packageName = safeFileName(
    getPackageNameFromTemplate(filenameTemplate, manifestData),
  );
  const extensionPath = path.join(artifactsDir, packageName);

  // Added 'wx' flags to avoid overwriting of existing package.
  const stream = createWriteStream(extensionPath, { flags: 'wx' });

  stream.write(buffer, () => {
    stream.end();
  });

  try {
    await fromEvent(stream, 'close');
  } catch (error) {
    if (!isErrorWithCode('EEXIST', error)) {
      throw error;
    }
    if (!overwriteDest) {
      throw new UsageError(
        `Extension exists at the destination path: ${extensionPath}\n` +
          'Use --overwrite-dest to enable overwriting.',
      );
    }
    log.info(`Destination exists, overwriting: ${extensionPath}`);
    const overwriteStream = createWriteStream(extensionPath);
    overwriteStream.write(buffer, () => {
      overwriteStream.end();
    });
    await fromEvent(overwriteStream, 'close');
  }

  if (showReadyMessage) {
    log.info(`Your web extension is ready: ${extensionPath}`);
  }
  return { extensionPath };
}

// Build command types and implementation.

export default async function build(
  {
    sourceDir,
    artifactsDir,
    asNeeded = false,
    overwriteDest = false,
    ignoreFiles = [],
    filename = DEFAULT_FILENAME_TEMPLATE,
  },
  {
    manifestData,
    createFileFilter = defaultFileFilterCreator,
    fileFilter = createFileFilter({
      sourceDir,
      artifactsDir,
      ignoreFiles,
    }),
    onSourceChange = defaultSourceWatcher,
    packageCreator = defaultPackageCreator,
    showReadyMessage = true,
  } = {},
) {
  const rebuildAsNeeded = asNeeded; // alias for `build --as-needed`
  log.info(`Building web extension from ${sourceDir}`);

  const createPackage = () =>
    packageCreator({
      manifestData,
      sourceDir,
      fileFilter,
      artifactsDir,
      overwriteDest,
      showReadyMessage,
      filename,
    });

  await prepareArtifactsDir(artifactsDir);
  const result = await createPackage();

  if (rebuildAsNeeded) {
    log.info('Rebuilding when files change...');
    onSourceChange({
      sourceDir,
      artifactsDir,
      onChange: () => {
        return createPackage().catch((error) => {
          log.error(error.stack);
          throw error;
        });
      },
      shouldWatchFile: (...args) => fileFilter.wantFile(...args),
    });
  }

  return result;
}

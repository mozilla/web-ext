/* @flow */
import {fs} from 'mz';

import {isErrorWithCode} from '../errors';

type FileExistsOptions = {|
  fileIsReadable: (filePath: string) => Promise<boolean>,
|};

/*
 * Resolves true if the path is a readable file.
 *
 * Usage:
 *
 * const exists = await fileExists(filePath);
 * if (exists) {
 *   // ...
 * }
 *
 * */
export default async function fileExists(
  path: string,
  {
    fileIsReadable = (f) => fs.access(f, fs.constants.R_OK),
  }: FileExistsOptions = {}
): Promise<boolean> {
  try {
    await fileIsReadable(path);
    const stat = await fs.stat(path);
    return stat.isFile();
  } catch (error) {
    if (isErrorWithCode(['EACCES', 'ENOENT'], error)) {
      return false;
    }
    throw error;
  }
}

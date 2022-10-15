import { spawnSync } from 'child_process';

import shell from 'shelljs';
import { expect } from 'chai';

export function isBuilt() {
  const isJS = (name) => name.endsWith('.js');
  const srcModules = Array.from(shell.ls('-R', 'src/')).filter(isJS);
  const libModules = Array.from(shell.ls('-R', 'lib/')).filter(isJS);

  try {
    expect(libModules).to.deep.equal(srcModules);
  } catch (err) {
    if (err.name !== 'AssertionError') {
      throw err;
    }

    console.log(
      'Missing build files in lib:',
      err.expected.reduce((result, filename) => {
        if (!err.actual.includes(filename)) {
          result += `\n- lib/${filename}`;
        }
        return result;
      }, ''),
      '\n'
    );

    return false;
  }

  return true;
}

export default () => {
  const res = spawnSync(
    'babel',
    ['--source-maps', 'true', 'src/', '-d', 'lib/'],
    {
      stdio: 'inherit',
      shell: true,
    }
  );
  if (res.error) {
    console.error(res.error);
    return false;
  }

  return res.status === 0;
};

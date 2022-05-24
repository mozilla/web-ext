import {spawnSync} from 'child_process';

import config from './config.js';

export default () => {
  const res = spawnSync('eslint', config.eslint.files, {
    stdio: 'inherit',
    shell: true,
  });
  if (res.error) {
    console.error(res.error);
    return false;
  }

  return res.status === 0;
};

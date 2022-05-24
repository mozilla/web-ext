const spawnSync = require('child_process').spawnSync;

const config = require('./config');

module.exports = () => {
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

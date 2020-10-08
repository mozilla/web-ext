const spawnSync = require('child_process').spawnSync;

exports.flowCheck = () => {
  if (process.env.TRAVIS_OS_NAME === 'windows') {
    console.log(`'flow check' task skipped because running on ${process.env.TRAVIS_OS_NAME}`);
  } else {
    const res = spawnSync('flow', ['check'], {stdio: 'inherit'});
    if (res.error || res.status !== 0) {
      if (res.error) {
        console.error(res.error);
      }
      return false;
    }
  }

  return true;
};

exports.flowStatus = () => {
  const res = spawnSync('flow', ['status'], {stdio: 'inherit'});
  if (res.error) {
    console.error(res.error);
    return false;
  }

  return res.status === 0;
};

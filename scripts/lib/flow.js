const spawnSync = require('child_process').spawnSync;

exports.flowCheck = () => {
  if (process.env.CI_SKIP_FLOWCHECK) {
    console.log('flow check task skipped on CI_SKIP_FLOWCHECK env set');
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

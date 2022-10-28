import { spawnSync } from 'child_process';

export const flowCheck = () => {
  if (process.env.CI_SKIP_FLOWCHECK) {
    console.log('flow check task skipped on CI_SKIP_FLOWCHECK env set');
  } else {
    const res = spawnSync('flow', ['check'], { stdio: 'inherit', shell: true });
    if (res.error || res.status !== 0) {
      if (res.error) {
        console.error(res.error);
      }
      return false;
    }
  }

  return true;
};

export const flowStatus = () => {
  const res = spawnSync('flow', ['status'], { stdio: 'inherit', shell: true });
  if (res.error) {
    console.error(res.error);
    return false;
  }

  return res.status === 0;
};

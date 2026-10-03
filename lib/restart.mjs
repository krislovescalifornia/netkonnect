import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Prepare the replacement before stopping the current service. The helper
// inherits this process's Windows token, including existing Administrator access.
export async function prepareRestart({ port, trafficPid = 0, launch = spawn }) {
  const helper = launch(process.execPath, [fileURLToPath(new URL('../restart-service.mjs', import.meta.url)),
    String(process.pid), String(trafficPid), String(port)], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), detached: true, windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => fail(new Error('The restart helper did not become ready. Try again.')), 5000);
    const cleanup = () => { clearTimeout(timeout); helper.off('error', fail); helper.off('exit', exited); helper.off('message', ready); };
    const fail = error => { cleanup(); helper.kill(); reject(error); };
    const exited = () => fail(new Error('The restart helper stopped before it was ready. Try again.'));
    const ready = message => { if (message?.type === 'ready') { cleanup(); resolve(); } };
    helper.once('error', fail); helper.once('exit', exited); helper.on('message', ready);
  });
  return async () => {
    await new Promise((resolve, reject) => helper.send({ type: 'restart' }, error => error ? reject(error) : resolve()));
    if (helper.connected) helper.disconnect();
    helper.unref();
  };
}

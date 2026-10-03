import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const [parentPid, trafficPid, port] = process.argv.slice(2).map(Number);
if (!process.send || !Number.isInteger(parentPid) || parentPid <= 0 ||
    !Number.isInteger(trafficPid) || trafficPid < 0 || !Number.isInteger(port) || port < 1 || port > 65535) process.exit(1);
const running = pid => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};
let restarting = false;
process.on('disconnect', () => { if (!restarting) process.exit(0); });
process.on('message', async message => {
  if (message?.type !== 'restart' || restarting) return;
  restarting = true;
  const deadline = Date.now() + 60000;
  // The server asks its collector to stop gracefully. Wait for both exits so
  // the new collector cannot race the old trace session.
  while (running(parentPid) || running(trafficPid)) {
    if (Date.now() >= deadline) process.exit(1);
    await delay(200);
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url)), '--port', String(port)], {
    cwd: fileURLToPath(new URL('./', import.meta.url)), detached: true, windowsHide: true, stdio: 'ignore'
  });
  child.once('error', () => process.exit(1));
  child.once('spawn', () => {
    try { writeFileSync(new URL('./launcher.pid', import.meta.url), String(child.pid) + '\n'); } catch { /* Optional local diagnostic. */ }
    child.unref(); process.exit(0);
  });
});
process.send({ type: 'ready' });

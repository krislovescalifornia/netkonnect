import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { enrichSnapshot } from './lib/network.mjs';
import { TrafficStore } from './lib/traffic.mjs';
import { AnalyticsStore } from './lib/analytics.mjs';

import { randomUUID } from 'node:crypto';
import { createAppServer } from './lib/http.mjs';
import { prepareRestart } from './lib/restart.mjs';

const instanceId = randomUUID();
let restarting = false, stopping = false, snapshotWorker;
const portArgument = process.argv.indexOf('--port');
const port = Number(portArgument >= 0 ? process.argv[portArgument + 1] : process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.');
let snapshot = null, busy = false, collectorError = null;
const sightings = new Map();
const traffic = new TrafficStore();
const analytics = new AnalyticsStore(fileURLToPath(new URL('./data/analytics/', import.meta.url)));
await analytics.load();
let trafficWorker;
function startTraffic() {
  if (process.platform !== 'win32') { traffic.ingest({ type:'status', available:false, message:'Detailed traffic capture requires Windows.' }); return; }
  trafficWorker = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./traffic.ps1', import.meta.url)), '-ParentId', String(process.pid)], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
  trafficWorker.stdin.on('error', () => {});
  createInterface({ input:trafficWorker.stdout }).on('line', line => {
    try { const batch=JSON.parse(line),now=Date.now();traffic.ingest(batch,now,snapshot);analytics.ingest(batch,now,snapshot); } catch { traffic.ingest({ type:'status', available:false, message:'Detailed collector returned invalid data.' }); }
  });
  let errorText = '';
  trafficWorker.stderr.on('data', chunk => { errorText = (errorText + chunk).slice(-2000); });
  trafficWorker.on('error', error => traffic.ingest({ type:'status', available:false, message:error.message }));
  trafficWorker.on('exit', code => { if (traffic.available) traffic.ingest({ type:'status', available:false, message:errorText || `Detailed traffic collector stopped (${code}). Restart netKonnect.` }); });
}
async function collect() {
  if (busy || stopping || restarting) return;
  busy = true;
  try {
    if (process.platform !== 'win32') throw new Error('Live monitoring requires Windows. The sample network is available from the interface.');
    const { stdout } = await new Promise((resolve, reject) => {
      snapshotWorker = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./collector.ps1', import.meta.url))], { windowsHide: true, timeout: 25000, maxBuffer: 12 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve({ stdout }));
    });
    if (stopping) return;
    const raw = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    snapshot = enrichSnapshot(raw, snapshot, snapshot?.history || [], sightings);
    collectorError = null;
  } catch (error) { collectorError = error.message; }
  finally { busy = false; }
}
const server = createAppServer({
  getAnalytics: options => analytics.query(options),
  getSnapshot: () => ({ snapshot: traffic.decorate(snapshot), collecting: busy, error: collectorError, interval: 2000,
    service: { instanceId, pid: process.pid, restarting } }),
  requestRestart: async () => {
    if (restarting) throw new Error('The service is already restarting.');
    restarting = true;
    try {
      const handoff = await prepareRestart({ port, trafficPid: trafficWorker?.exitCode === null ? trafficWorker.pid : 0 });
      return async () => {
        try { await handoff(); stop(); }
        catch (error) { restarting = false; collectorError = 'Could not restart the service: ' + error.message; }
      };
    } catch (error) { restarting = false; throw error; }
  }
});
server.listen(port, '127.0.0.1', () => { console.log(`netKonnect is ready at http://127.0.0.1:${port}`); collect(); startTraffic(); });
const timer = setInterval(collect, 8000);
const historyTimer = setInterval(() => analytics.flush(), 15000);
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  clearInterval(historyTimer);
  snapshotWorker?.kill();
  const closed = new Promise(resolve => server.close(resolve));
  server.closeAllConnections();
  const traceStopped = new Promise(resolve => {
    if (trafficWorker?.exitCode !== null || !trafficWorker?.pid) { resolve(); return; }
    trafficWorker.once('exit', resolve);
    trafficWorker.stdin.end('stop\n');
  });
  Promise.all([closed, traceStopped]).then(() => analytics.flush()).then(() => process.exit(0));
  // Parent-exit detection remains a fallback if a broken collector ignores stdin.
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

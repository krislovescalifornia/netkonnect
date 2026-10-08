import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { enrichSnapshot } from './lib/network.mjs';
import { TrafficStore } from './lib/traffic.mjs';
import { AnalyticsStore } from './lib/analytics.mjs';
import { EvidenceStore } from './lib/evidence.mjs';
import { AppIcons, windowsIconReader } from './lib/app-icons.mjs';
import { IconWishlist } from './lib/icon-wishlist.mjs';

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
const evidence = new EvidenceStore();
const analytics = new AnalyticsStore(fileURLToPath(new URL('./data/analytics/', import.meta.url)));
await analytics.load();
const root=fileURLToPath(new URL('./',import.meta.url));
const icons=new AppIcons(analytics.directory,{readIcons:windowsIconReader(root)}),wishlist=new IconWishlist(analytics.directory);
await Promise.all([icons.load(),wishlist.load()]);
let lastObservation=Date.now();
let trafficWorker;
function startTraffic() {
  if (process.platform !== 'win32') { traffic.ingest({ type:'status', available:false, message:'Detailed traffic capture requires Windows.' }); return; }
  trafficWorker = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./traffic.ps1', import.meta.url)), '-ParentId', String(process.pid)], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
  trafficWorker.stdin.on('error', () => {});
  createInterface({ input:trafficWorker.stdout }).on('line', line => {
    try {
      const batch=JSON.parse(line),now=Date.now();
      if(evidence.nativeBatch(batch,now))return;
      const observed=evidence.snapshot(snapshot,now);
      const annotated=batch.type==='traffic'?{...batch,flows:(batch.flows||[]).map(c=>evidence.annotate({...c,app:c.owner?.name||snapshot?.processes?.[c.pid],owner:c.owner||snapshot?.processDetails?.[c.pid]},now))}:batch;
      traffic.ingest(annotated,now,observed);analytics.ingest(annotated,now,observed);
      wishlist.ingest(annotated,observed,now);
      if(annotated.type==='traffic')icons.observe({processDetails:snapshot?.processDetails,connections:annotated.flows});
    } catch { traffic.ingest({ type:'status', available:false, message:'Detailed collector returned invalid data.' }); }
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
    icons.observe(snapshot);wishlist.observe(snapshot,Math.min(8,(Date.now()-lastObservation)/1000));lastObservation=Date.now();
    collectorError = null;
  } catch (error) { collectorError = error.message; }
  finally { busy = false; }
}
const server = createAppServer({
  getAnalytics: options => ({...analytics.query(options),appIcons:icons.catalog()}),
  getIcon: id=>icons.read(id),
  getSnapshot: () => ({ snapshot: snapshot?{...evidence.snapshot(traffic.decorate(snapshot, Date.now(), [...analytics.cityUsage.values()])),appIcons:icons.catalog(),iconWishlist:wishlist.report()}:null, collecting: busy, error: collectorError, interval: 2000,
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
const historyTimer = setInterval(() => Promise.all([analytics.flush(),wishlist.flush(),icons.flush()]), 15000);
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
  Promise.all([closed, traceStopped]).then(() => Promise.all([analytics.flush(),wishlist.flush(),icons.close()])).then(() => process.exit(0));
  // Parent-exit detection remains a fallback if a broken collector ignores stdin.
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

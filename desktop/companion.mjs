import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { enrichSnapshot } from '../lib/network.mjs';
import { TrafficStore } from '../lib/traffic.mjs';
import { SQLiteHistory } from '../lib/sqlite-history.mjs';
import { pipeName, servePipe, writeEndpoint } from './pipe.mjs';
import { queryHistory } from './query.mjs';
import { StringDecoder } from 'node:string_decoder';
import { companionProtocol } from './companion-identity.mjs';
import {EvidenceStore} from '../lib/evidence.mjs';
import {EnhancedLookup} from '../lib/enhanced-lookup.mjs';

export async function startCompanion({ directory, root, version, packaged, onSmokeStop = null, onQuit = null }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const history = new SQLiteHistory(directory, { legacyDirectory: packaged ? null : join(root, 'data', 'analytics') });
  await history.load();
  let enrichment={browser:false,chrome:false,edge:false,enhancedLookup:false};
  try {const saved=JSON.parse(await readFile(join(directory,'enrichment.json'),'utf8'));enrichment={browser:saved.browser===true,chrome:saved.chrome===true,edge:saved.edge===true,enhancedLookup:saved.enhancedLookup===true};}catch{}
  const evidence=new EvidenceStore({browserEnabled:enrichment.browser,browsers:enrichment}),lookup=new EnhancedLookup(root);
  lookup.setEnabled(enrichment.enhancedLookup);
  const enriched=(c,now)=>lookup.annotate(evidence.annotate(c,now));
  let snapshot = null, collecting = false, error = null, stopping = false, snapshotWorker, trafficWorker, traceSocket;
  let instanceId = randomUUID(), traffic = new TrafficStore(), lastSnapshot = Date.now(), retryAt = 0, lastLost = 0, lastBuffersLost = 0;
  const sightings = new Map(), startedAt = Date.now();
  const endpoint = { pipe: pipeName(), token: randomBytes(32).toString('hex'), pid: process.pid };
  const trace = { pipe: pipeName(), token: randomBytes(32).toString('hex'), parentId: process.pid };
  let privilegedFirewall = false, privilegedError = '';
  const ingest = (line, privileged = false) => {
    try {
      const batch = JSON.parse(line), now = Date.now();
      if (batch.type === 'protection') { if (privileged) privilegedFirewall = batch.firewall === true; return; }
      if(!privileged&&traceSocket)return;
      if(evidence.nativeBatch(batch,now))return;
      if (privileged && batch.type === 'status') privilegedError = batch.available ? '' : batch.message || '';
      if (!privileged && privilegedError && batch.type === 'status' && !batch.available) return;
      if(batch.type==='status'&&batch.available){lastLost=0;lastBuffersLost=0;}
      const cumulative=['eventsLost','collectorDropped','malformedEvents','unsupportedEvents'].reduce((sum,key)=>sum+Math.max(0,Number(batch[key])||0),0),delta=Math.max(0,cumulative-lastLost);
      const buffers=Math.max(0,Number(batch.buffersLost)||0),buffersDelta=Math.max(0,buffers-lastBuffersLost);
      const enrichedBatch=batch.type==='traffic'?{...batch,flows:(batch.flows||[]).map(c=>enriched({...c,app:c.owner?.name||snapshot?.processes?.[c.pid],owner:c.owner||snapshot?.processDetails?.[c.pid]},now))}:batch;
      const observed=evidence.snapshot(snapshot,now);
      traffic.ingest(enrichedBatch, now, observed); history.ingest({...enrichedBatch,eventsLost:delta,buffersLost:buffersDelta}, now, observed);
      if(batch.type==='traffic'){lastLost=cumulative;lastBuffersLost=buffers;}
    }
    catch { traffic.ingest({ type: 'status', available: false, message: 'The detailed collector returned invalid data.' }); }
  };
  const traceServer = net.createServer(socket => {
    socket.on('error', () => {});
    socket.setTimeout(8000, () => socket.destroy());
    const decoder=new StringDecoder('utf8');let input='',authorized=false;
    socket.on('data',chunk=> {
      input+=decoder.write(chunk);
      if(Buffer.byteLength(input)> (authorized ? 12*1024*1024 : 128*1024)){socket.destroy();return;}
      let end;
      while((end=input.indexOf('\n'))>=0) {
        const line=input.slice(0,end).replace(/\r$/,'');input=input.slice(end+1);
        if(!authorized) {
          if(line!==trace.token || traceSocket){socket.destroy();return;}
          authorized=true;traceSocket=socket;socket.setTimeout(12000);
        } else ingest(line, true);
      }
    });
    socket.once('close', () => {
      if (traceSocket === socket) { traceSocket = null; privilegedFirewall = false;for(const source of ['windows-dns-etw','wfp-audit','process-etw'])evidence.status(source,false,'Privileged helper disconnected'); traffic.ingest({ type: 'status', available: false, message: !traffic.available && traffic.message ? traffic.message : 'Detailed capture stopped. Click Easy Button to check and repair setup.' }); }
    });
  });
  traceServer.maxConnections = 4;
  await new Promise((resolve, reject) => { traceServer.once('error', reject); traceServer.listen(trace.pipe, resolve); });
  await writeFile(join(directory, 'trace-request.json.tmp'), JSON.stringify(trace), { mode: 0o600 });
  await rename(join(directory, 'trace-request.json.tmp'), join(directory, 'trace-request.json'));

  function startBasicTrace() {
    if (stopping || traceSocket || trafficWorker?.exitCode === null) return;
    trafficWorker = spawn('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'traffic.ps1'),'-ParentId',String(process.pid)], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    trafficWorker.stdin.on('error', () => {});
    createInterface({ input: trafficWorker.stdout }).on('line', ingest);
    trafficWorker.stderr.resume();
    trafficWorker.on('error', e => { traffic.ingest({ type:'status',available:false,message:e.message }); retryAt = Date.now() + 60000; });
    trafficWorker.on('exit', () => { if(!traceSocket)evidence.status('process-etw',false,'Basic capture stopped');retryAt = Date.now() + 60000; });
  }
  async function collect() {
    if (collecting || stopping) return;
    collecting = true;
    try {
      const raw = await new Promise((resolve, reject) => {
        snapshotWorker = execFile('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'collector.ps1')], { windowsHide:true, timeout:25000, maxBuffer:12 * 1024 * 1024, encoding:'utf8' }, (e, stdout) => e ? reject(e) : resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())));
      });
      if (stopping) return;
      snapshot = evidence.snapshot(enrichSnapshot(raw, snapshot, snapshot?.history || [], sightings));
      history.observe(snapshot, Math.min(8, (Date.now() - lastSnapshot) / 1000)); lastSnapshot = Date.now(); error = null;
    } catch (e) { error = e.message; } finally { collecting = false; }
  }
  const getSnapshot = () => {
    const now=Date.now(),decorated=evidence.snapshot(traffic.decorate(snapshot,now,[...history.cityUsage.values()]),now);
    if(decorated){decorated.connections=decorated.connections.map(c=>lookup.annotate(c));decorated.enrichment={...enrichment};}
    return { snapshot:decorated, collecting, error, interval:2000,
    service: { instanceId, pid:process.pid, restarting:false, companion:true, startedAt,
      identity:{ protocol:companionProtocol, root, version }, protection:{ firewall:!!traceSocket && privilegedFirewall },
      observations:{ processes:!!snapshot?.processes, dns:Array.isArray(snapshot?.dnsRecords) },
      database:join(directory,'history.sqlite'), storageError:history.error } };
  };
  let preferenceUpdate=Promise.resolve();
  function setEnrichment(params) {
    if(typeof params?.enabled!=='boolean'||!['browser','chrome','edge','enhancedLookup'].includes(params.feature))throw new Error('Invalid enrichment preference.');
    const update=preferenceUpdate.then(async()=>{
    if(params.feature!=='enhancedLookup') {
      await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'desktop','browser-bridge.ps1'),'-Action',params.enabled?'Enable':'Disable','-DataDirectory',directory,'-Browser',params.feature==='browser'?'firefox':params.feature],{windowsHide:true,timeout:20000},error=>error?reject(error):resolve()));
    }
    const next={...enrichment,[params.feature]:params.enabled};
    await writeFile(join(directory,'enrichment.json.tmp'),JSON.stringify(next),{mode:0o600});
    await rename(join(directory,'enrichment.json.tmp'),join(directory,'enrichment.json'));
    if(params.feature!=='enhancedLookup')evidence.setBrowserEnabled(params.enabled,params.feature==='browser'?'firefox':params.feature);else lookup.setEnabled(params.enabled);
    enrichment=next;
    return {...enrichment};
    });
    preferenceUpdate=update.catch(()=>{});return update;
  }
  async function restart() {
    // Reinitialize live capture without exiting the tray companion or losing history.
    await history.flush();
    const worker = trafficWorker;
    if (worker?.exitCode === null) await new Promise(resolve => { worker.once('exit',resolve); worker.stdin.end('stop\n'); });
    // Privileged helper retains its own ETW session; only reset presentation state.
    traffic = new TrafficStore(); instanceId = randomUUID();
    if (traceSocket) traffic.ingest({ type:'status',available:true }); else startBasicTrace();
    return { restarting:true };
  }
  const ipc = servePipe(endpoint, (method, params) => {
    if (method === 'quit' && onQuit) { setTimeout(onQuit,100); return { stopping:true }; }
    if (method === 'smoke-stop' && onSmokeStop) { setTimeout(onSmokeStop,100); return { stopping:true }; }
    if (method === 'snapshot') return getSnapshot();
    if (method === 'enrichment-settings') return {...enrichment};
    if (method === 'set-enrichment') return setEnrichment(params);
    if (method === 'enhanced-lookup') return lookup.lookup(params?.address);
    if (method === 'browser-evidence') return evidence.browserBatch(params);
    if (method === 'analytics') return queryHistory(history, params);
    if (method === 'restart') return restart();
    if (method === 'checkpoint') return history.flush().then(() => {
      if (history.error) throw new Error(history.error);
      return { saved:true };
    });
    if (method === 'capture-stop') { traceSocket?.write('stop\n'); return { stopped:true }; }
    throw new Error('Unknown local companion operation.');
  });
  await new Promise((resolve, reject) => { ipc.server.once('error', reject); ipc.server.listen(endpoint.pipe, resolve); });
  await writeEndpoint(directory, endpoint);
  collect(); startBasicTrace();
  const collectTimer = setInterval(collect, 8000), saveTimer = setInterval(() => history.flush(), 15000);
  // Retry failed basic capture periodically; an installed elevated task connects independently.
  const retryTimer = setInterval(() => { if (!traceSocket && trafficWorker?.exitCode !== null && Date.now() >= retryAt) startBasicTrace(); }, 15000);
  return {
    getSnapshot,
    async stop() {
      if (stopping) return; stopping = true;
      lookup.setEnabled(false);
      for (const timer of [collectTimer, saveTimer, retryTimer]) clearInterval(timer);
      snapshotWorker?.kill();
      await ipc.close();
      const ended = [];
      if (trafficWorker?.exitCode === null) ended.push(new Promise(resolve => { trafficWorker.once('exit', resolve); trafficWorker.stdin.end('stop\n'); }));
      if (traceSocket) { const socket = traceSocket; ended.push(new Promise(resolve => { socket.once('close', resolve); socket.write('stop\n'); })); }
      await Promise.race([Promise.all(ended), new Promise(resolve => setTimeout(resolve, 8000).unref())]);
      traceSocket?.destroy(); traceServer.close();
      await history.close();
    }
  };
}

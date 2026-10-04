import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { SQLiteHistory } from '../lib/sqlite-history.mjs';
import { pipeName, servePipe, writeEndpoint, callCompanion } from '../desktop/pipe.mjs';
import { isLocalAsset, configureOfflineSession } from '../desktop/offline.mjs';
import { validateQuery, queryHistory } from '../desktop/query.mjs';
import { coverageRibbon } from '../public/companion-ui.js';
import { assertCompanionIdentity, companionProtocol } from '../desktop/companion-identity.mjs';

const now = Date.parse('2026-10-08T16:00:00Z');
async function directory(t) { const d = await mkdtemp(join(tmpdir(),'nk-desktop-')); t.after(()=>rm(d,{recursive:true,force:true})); return d; }
const flow = {pid:42,protocol:'UDP',remoteAddress:'1.2.3.4',remotePort:443,receivedBytes:120,sentBytes:30};
const snapshot = {processes:{42:'firefox'},connections:[],adapters:[{id:'ethernet',receiveRate:100,sendRate:20,receivedErrors:0,sentErrors:0}]};

test('installed UI rejects legacy, preview and outdated companions before accepting their data',()=>{
  const root=join(tmpdir(),'installed','resources','app'), version='1.1.2';
  const data={service:{identity:{protocol:companionProtocol,root,version}}};
  assert.equal(assertCompanionIdentity(data,root,version),data);
  for(const broken of [{service:{}},{service:{identity:{...data.service.identity,root:join(tmpdir(),'preview')}}},
    {service:{identity:{...data.service.identity,version:'1.1.1'}}}]) {
    assert.throws(()=>assertCompanionIdentity(broken,root,version),/older or different.*Quit/);
  }
});

test('Sunday through Wednesday SQLite history, independent observations and coverage survive Thursday reopening', async t => {
  const d = await directory(t), store = new SQLiteHistory(d); await store.load(now);
  for (const date of ['04','05','06','07']) {
    const at = Date.parse(`2026-10-${date}T16:00:00Z`);
    store.ingest({type:'traffic',elapsed:2,eventsLost:0,flows:[flow]},at,snapshot);
    store.observe(snapshot,8,at); await store.flush();
  }
  await store.close();
  const reopened = new SQLiteHistory(d); await reopened.load(now);
  const data = reopened.query({range:'all',timezone:'UTC'},now);
  assert.equal(data.total,600); assert.equal(data.matches.length,4); assert.equal(data.archive.seconds,8);
  assert.equal(data.collectionTimeline.length,4); assert.equal(data.collectionTimeline.reduce((s,r)=>s+r.snapshotSeconds,0),32);
  assert.ok(data.timeline.every(point=>typeof point.key==='string'));
  assert.equal(reopened.db.prepare('SELECT SUM(received) AS n FROM adapter_minutes').get().n,3200);
  assert.equal(data.observationSummary.received,3200);
  assert.equal(data.apps[0].key,'firefox');
  await reopened.close();
});
test('failed SQLite checkpoint rolls back all records and retains dirty intervals for retry',async t=>{
  const store = new SQLiteHistory(await directory(t)); await store.load(now);
  store.ingest({type:'traffic',elapsed:2,flows:[flow,{...flow,remoteAddress:'1.2.3.5'}]},now,snapshot);
  const save=store.saveRecord.bind(store);let n=0;
  store.saveRecord=r=>{save(r);if(++n===2)throw new Error('simulated disk failure');};
  await store.flush();assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM hourly_usage').get().n,0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM observation_minutes').get().n,0);
  assert.equal(store.dirty.size,1);assert.match(store.error,/simulated disk failure/);
  store.saveRecord=save;await store.flush();assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM hourly_usage').get().n,2);
  await store.close();
});
test('legacy JSON import is idempotent and malformed imports do not destroy SQLite history',async t=>{
  const d=await directory(t), legacy=join(d,'legacy');await mkdir(legacy);
  const source=new SQLiteHistory(join(d,'source'));await source.load(now);source.ingest({type:'traffic',elapsed:2,flows:[flow]},now,snapshot);
  const records=[...source.days.values()].flatMap(day=>[...day.values()]);await source.close();
  await writeFile(join(legacy,'2026-10-08.json'),JSON.stringify({records,coverage:[{at:now,seconds:2}]}));
  await writeFile(join(legacy,'2026-10-07.json'),'broken');
  const dest=join(d,'dest');const first=new SQLiteHistory(dest,{legacyDirectory:legacy});await first.load(now);
  assert.match(first.error,/could not be imported/);assert.equal(first.query({range:'all'},now).total,150);await first.close();
  const second=new SQLiteHistory(dest,{legacyDirectory:legacy});await second.load(now);
  assert.equal(second.query({range:'all'},now).total,150);assert.equal(second.observedHours.get(now),2);
  await second.close();
});
test('local companion IPC authenticates capabilities, rejects invalid methods and preserves errors',async t=>{
  const d=await directory(t),endpoint={pipe:pipeName(),token:'a'.repeat(64)};
  const ipc=servePipe(endpoint,(method,params)=>{if(method==='snapshot')return {alive:true,params};throw new Error('Unknown local operation');});
  ipc.server.listen(endpoint.pipe);await once(ipc.server,'listening');t.after(()=>ipc.close());
  await writeEndpoint(d,endpoint);assert.deepEqual(await callCompanion(d,'snapshot',{hello:1}),{alive:true,params:{hello:1}});
  await assert.rejects(callCompanion(d,'shell'),/Unknown local operation/);
  await writeEndpoint(d,{...endpoint,token:'b'.repeat(64)});await assert.rejects(callCompanion(d,'snapshot'),/access denied/);
});

test('installed helper writes intervals while its duplex control thread waits for stop', {skip:process.platform!=='win32',timeout:15000},async t=>{
  const d=await directory(t), desktop=join(d,'resources','app','desktop');await mkdir(desktop,{recursive:true});
  await copyFile('desktop/trace-session.ps1',join(desktop,'trace-session.ps1'));
  await copyFile('test/trace-pipe.ps1',join(desktop,'trace-pipe.ps1'));
  const endpoint={pipe:pipeName(),token:'a'.repeat(64),parentId:process.pid};
  await writeFile(join(d,'trace-request.json'),JSON.stringify(endpoint));
  let intervals=0,input='',authorized=false;
  const sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
    socket.on('data',chunk=>{
      input+=chunk.toString();let end;
      while((end=input.indexOf('\n'))>=0){
        const line=input.slice(0,end).trim();input=input.slice(end+1);
        if(!authorized){assert.equal(line,endpoint.token);authorized=true;continue;}
        const batch=JSON.parse(line);
        if(batch.type==='traffic'&&++intervals===3)socket.write('stop\n');
      }
    });
  });
  server.listen(endpoint.pipe);await once(server,'listening');
  t.after(()=>{for(const socket of sockets)socket.destroy();server.close();});
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(desktop,'trace-pipe.ps1'),'-DataDirectory',d,'-UserId','S-1-5-21-123-456-789-1001'],{windowsHide:true});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  let errors='';child.stderr.on('data',chunk=>errors+=chunk);child.stdout.resume();
  const timer=setTimeout(()=>child.kill(),10000);
  const [code]=await once(child,'exit');clearTimeout(timer);
  assert.equal(code,0,errors||'Duplex write blocked behind the control read');
  assert.equal(intervals,3);
});
test('offline guards reject HTTP, HTTPS, TCP, UDP, TLS, DNS and global fetch before any request leaves',()=>{
  const script=`import {installNodeOfflineGuard} from './desktop/offline.mjs';import net from 'node:net';import http from 'node:http';import https from 'node:https';import dns from 'node:dns';import dgram from 'node:dgram';import tls from 'node:tls';import assert from 'node:assert/strict';installNodeOfflineGuard();for(const fn of [()=>net.connect(443,'example.com'),()=>net.createServer().listen(0),()=>http.get('http://example.com'),()=>https.request('https://example.com'),()=>dns.lookup('example.com',()=>{}),()=>dns.promises.resolve('example.com'),()=>dgram.createSocket('udp4'),()=>tls.connect(443),()=>fetch('https://example.com')])assert.throws(fn,/offline policy/);console.log('blocked');`;
  assert.match(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),encoding:'utf8'}),/blocked/);
});
test('Chromium permits only bundled assets and denies permission, device and external download requests',()=>{
  for(const url of ['https://example.com','http://127.0.0.1:4317','file:///C:/secret','netkonnect://evil/app.js','netkonnect://user:pass@app/a'])assert.equal(isLocalAsset(url),false);
  assert.equal(isLocalAsset('netkonnect://app/app.js'),true);
  const handlers={};const session={webRequest:{onBeforeRequest:fn=>handlers.request=fn},setPermissionRequestHandler:fn=>handlers.permission=fn,setPermissionCheckHandler:fn=>handlers.check=fn,setDevicePermissionHandler:fn=>handlers.device=fn,on:(_name,fn)=>handlers.download=fn};
  configureOfflineSession(session);
  handlers.request({url:'https://example.com'},r=>assert.equal(r.cancel,true));
  handlers.request({url:'netkonnect://app/style.css'},r=>assert.equal(r.cancel,false));
  handlers.permission(null,'geolocation',r=>assert.equal(r,false));assert.equal(handlers.check(),false);assert.equal(handlers.device(),false);
  let cancelled=false;handlers.download(null,{getURL:()=> 'https://example.com',cancel:()=>cancelled=true});assert.equal(cancelled,true);
});
test('desktop query validates filters and emits safe full exports',()=>{
  for(const options of [{from:'2026-02-30'},{min:'-1'},{offset:'-4'},{weekday:7},{scope:'Unknown'},{query:'x'.repeat(3000)}])assert.throws(()=>validateQuery(options));
  const store={query:()=>({matches:[{period:'2026-10-04',app:'=danger',received:3,sent:1,services:['x']}],filters:{timezone:'UTC'}})};
  assert.match(queryHistory(store,{export:'csv'}).csv,/"'=danger"/);
  assert.equal(queryHistory(store,{}).matchCount,1);
});
test('coverage distinguishes captured bytes, snapshots and days with no collection',()=>{
  const html=coverageRibbon([{at:now-86400000,snapshotSeconds:30,captureSeconds:0,lostEvents:0},{at:now,snapshotSeconds:60,captureSeconds:60,lostEvents:3}],now+60000);
  assert.match(html,/Snapshots/);assert.match(html,/No capture/);assert.match(html,/3 lost events/);assert.match(html,/0.0h/);
});

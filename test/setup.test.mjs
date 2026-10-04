import test from 'node:test';
import assert from 'node:assert/strict';
import { createSetup, setupChecks } from '../desktop/setup.mjs';
import { execFileSync } from 'node:child_process';
import { TrafficStore } from '../lib/traffic.mjs';
import { enrichSnapshot } from '../lib/network.mjs';

const now = Date.parse('2026-10-03T12:00:00Z');
const config = {startup:true,detailedStartup:true,firewall:true};
const snapshot = () => ({snapshot:{timestamp:new Date(now).toISOString(),traffic:{available:true},connections:[],adapters:[],dnsRecords:[],processes:{}},service:{companion:true,database:'history.sqlite'}});
function harness(overrides = {}) {
  const calls = [];
  let clock = now;
  const deps = {
    ensureCompanion:async()=>calls.push('companion'), readSettings:async()=>config,
    configure:async()=>calls.push('configure'), startHelper:async()=>calls.push('start'),
    enableStartup:async()=>calls.push('startup'), readSnapshot:async()=>snapshot(), checkpoint:async()=>calls.push('save'),
    now:()=>clock, delay:async ms=>{clock+=ms;}, timeout:2000, ...overrides
  };
  return { run:createSetup(deps), calls };
}
test('Easy Button repairs all missing setup, waits for live bytes and verifies a checkpoint',async()=>{
  let installed=false, reads=0;
  const h=harness({readSettings:async()=>installed?config:{...config,detailedStartup:false,firewall:false},
    configure:async()=>{h.calls.push('configure');installed=true;},
    readSnapshot:async()=>{const data=snapshot();data.snapshot.traffic.available=++reads>=3;return data;}});
  const result=await h.run();
  assert.equal(result.complete,true);assert.equal(result.checks.length,7);
  assert.deepEqual(h.calls,['companion','configure','startup','save']);
});
test('healthy repeated setup avoids new elevation and restarting capture',async()=>{
  const h=harness();await h.run();await h.run();
  assert.deepEqual(h.calls,['companion','startup','save','companion','startup','save']);
});
test('installed idle helper starts without reconfiguring privileges',async()=>{
  let reads=0;
  const h=harness({readSnapshot:async()=>{const data=snapshot();data.snapshot.traffic.available=++reads>1;return data;}});
  await h.run();assert.deepEqual(h.calls,['companion','start','startup','save']);
});
test('double clicks share one setup and cancellation permits a later successful retry',async()=>{
  let cancel=true;
  const h=harness({readSettings:async()=>({...config,detailedStartup:!cancel}),configure:async()=>{throw new Error('Windows approval canceled');}});
  const first=h.run();assert.equal(h.run(),first);
  await assert.rejects(first,/canceled/);cancel=false;assert.equal((await h.run()).complete,true);
});
test('registered helpers cannot report success while capture is stale or unavailable',async()=>{
  const data=snapshot();data.snapshot.traffic.available=false;data.snapshot.traffic.message='Another capture session is running.';
  const h=harness({readSnapshot:async()=>data});
  await assert.rejects(h.run(),/Measured TCP \/ UDP bytes.*Another capture session/);
  assert.ok(!h.calls.includes('save'));
  const stale=snapshot();stale.snapshot.timestamp=new Date(now-31000).toISOString();
  assert.equal(setupChecks(config,stale,now).find(c=>c.id==='capture').ready,false);
});
test('failed persistent startup or history checkpoint prevents completion',async()=>{
  const h=harness({readSettings:async()=>({...config,startup:false})});
  await assert.rejects(h.run(),/Automatic collection at sign-in/);
  assert.equal(h.run.getProgress().step,4);
  assert.ok(!h.calls.includes('save'));
  const broken=harness({checkpoint:async()=>{throw new Error('Disk full');}});
  await assert.rejects(broken.run(),/Disk full/);
  const data=snapshot();data.service.storageError='Disk full';
  assert.equal(setupChecks(config,data,now).find(c=>c.id==='history').ready,false);
});
test('progress follows real setup stages, includes live checks, and completes only after checkpoint',async()=>{
  const updates=[];let release;
  const checkpoint=new Promise(resolve=>{release=resolve;});
  const h=harness({onProgress:p=>updates.push(p),checkpoint:()=>checkpoint});
  const pending=h.run();
  while(!updates.some(p=>p.step===6))await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual([...new Set(updates.map(p=>p.step))],[1,2,3,4,5,6]);
  assert.ok(updates.every(p=>p.percent<100));
  assert.equal(h.run.getProgress().state,'running');
  assert.ok(updates.find(p=>p.step===5&&p.checks.length).checks.every(c=>c.ready));
  release();await pending;
  assert.equal(updates.at(-1).percent,100);assert.equal(updates.at(-1).state,'complete');
  assert.ok(updates.every((p,i)=>!i||p.percent>=updates[i-1].percent));
});
test('bundle preflight fails before OS changes and retry starts progress from zero',async()=>{
  const updates=[];let broken=true;
  const h=harness({onProgress:p=>updates.push(p),preflight:async()=>{if(broken)throw new Error('Missing collector.ps1');}});
  await assert.rejects(h.run(),/Missing collector/);assert.deepEqual(h.calls,[]);
  assert.equal(updates.at(-1).state,'error');assert.equal(updates.at(-1).step,1);
  broken=false;await h.run();assert.equal(updates[2].percent,0);assert.equal(updates.at(-1).state,'complete');
});
test('timeout and failed checkpoint identify the current step without showing 100 percent',async()=>{
  const data=snapshot();data.snapshot.traffic.available=false;
  const timeout=harness({readSnapshot:async()=>data});await assert.rejects(timeout.run());
  assert.equal(timeout.run.getProgress().step,5);assert.equal(timeout.run.getProgress().state,'error');
  assert.ok(timeout.run.getProgress().percent<100);
  const disk=harness({checkpoint:async()=>{throw new Error('Disk full');}});await assert.rejects(disk.run());
  assert.equal(disk.run.getProgress().step,6);assert.equal(disk.run.getProgress().error,'Disk full');
  assert.ok(disk.run.getProgress().percent<100);
});
test('real decorated companion snapshots retain readiness evidence after process and DNS maps are stripped',async()=>{
  const raw=enrichSnapshot({timestamp:new Date(now).toISOString(),processes:{42:'firefox'},dns:[],connections:[],adapters:[]},null);
  const traffic=new TrafficStore();traffic.ingest({type:'traffic',elapsed:2,flows:[]},now);
  const data={snapshot:traffic.decorate(raw,now),service:{companion:true,database:'history.sqlite',
    observations:{processes:!!raw.processes,dns:Array.isArray(raw.dnsRecords)}}};
  assert.equal(data.snapshot.processes,undefined);assert.equal(data.snapshot.dnsRecords,undefined);
  assert.ok(setupChecks(config,data,now).every(c=>c.ready));
  assert.equal((await harness({readSnapshot:async()=>data}).run()).complete,true);
  data.service.observations.dns=false;
  assert.equal(setupChecks(config,data,now).find(c=>c.id==='snapshots').ready,false);
});
test('Windows capture setup configures customer identity and verifies actual helper settings', {skip:process.platform!=='win32'},()=>{
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','test/setup-task.ps1'],{encoding:'utf8'});
  assert.match(output,/Setup task checks passed/);
});

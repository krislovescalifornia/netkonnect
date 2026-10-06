import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SQLiteHistory} from '../lib/sqlite-history.mjs';
import {AnalyticsStore} from '../lib/analytics.mjs';
import {CITY_STAGES,cityStage} from '../public/cities.js';
import {buildRoutes,groupApplicationRoutes} from '../public/routes.js';
const now=Date.parse('2026-10-06T12:00:00Z');
const c={app:'firefox',pid:7,scope:'Internet',state:'Observed',protocol:'UDP',remoteAddress:'8.8.8.8',remotePort:443,domainCandidates:['googlevideo.com'],receiveRate:100,sendRate:20,receivedBytes60m:200,sentBytes60m:40};
const snapshot={connections:[c],processes:{7:'firefox'},adapters:[]};
const batch={type:'traffic',elapsed:2,flows:[{...c,receivedBytes:200,sentBytes:40}]};
test('all seven city stages use byte boundaries and unknown capture stays unknown',()=>{
  assert.equal(cityStage(null).known,false);
  for(const [index,stage] of CITY_STAGES.entries()) {
    assert.equal(cityStage(stage.at).index,index);
    if(index)assert.equal(cityStage(stage.at-1).index,index-1);
  }
  assert.equal(cityStage(32*1024**2).progress,.5);
});
test('cities survive checkpoint failure, reopening and 400-day analytics pruning without counting polls',async t=>{
  const d=await mkdtemp(join(tmpdir(),'nk-cities-'));t.after(()=>rm(d,{recursive:true,force:true}));
  let store=new SQLiteHistory(d);await store.load(now);store.ingest(batch,now,snapshot);
  const save=store.saveRecord.bind(store);store.saveRecord=()=>{throw new Error('disk failure');};
  await store.flush();assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM city_usage').get().n,0);
  store.saveRecord=save;await store.close();
  const later=now+401*86400000;store=new SQLiteHistory(d);await store.load(later);
  assert.equal(store.days.size,0);assert.equal([...store.cityUsage.values()][0].receivedBytesTotal,200);
  store.ingest(batch,later,snapshot);await store.flush();
  const cityUsage=[...store.cityUsage.values()];
  for(let poll=0;poll<5;poll++) {
    const routes=buildRoutes([c],{cityUsage});assert.equal(routes[0].cityBytes,480);
    assert.equal(routes[0].totalBytes60m,240);assert.equal(groupApplicationRoutes(routes)[0].cityBytes,480);
  }
  assert.equal(buildRoutes([c],{detail:'endpoint',cityUsage})[0].cityBytes,480);
  store.observe(snapshot,8,later);await store.close();store=new SQLiteHistory(d);await store.load(later);
  assert.equal([...store.cityUsage.values()][0].receivedBytesTotal,400);await store.close();
});
test('legacy web cities reload independently of rolling usage and exclude local/PID-zero bytes',async t=>{
  const d=await mkdtemp(join(tmpdir(),'nk-city-web-'));t.after(()=>rm(d,{recursive:true,force:true}));
  const store=new AnalyticsStore(d);await store.load(now);
  store.ingest({...batch,flows:[...batch.flows,{...batch.flows[0],pid:0},{...batch.flows[0],remoteAddress:'127.0.0.1'}]},now,snapshot);
  assert.equal(store.cityUsage.size,1);await store.flush();
  const reopened=new AnalyticsStore(d);await reopened.load(now+401*86400000);
  assert.equal(reopened.days.size,0);assert.equal([...reopened.cityUsage.values()][0].receivedBytesTotal,200);
});

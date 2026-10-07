import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SQLiteHistory} from '../lib/sqlite-history.mjs';
import {AnalyticsStore} from '../lib/analytics.mjs';
import {CITY_STAGES,cityStage,cityArtwork,cityConstruction,renderCity} from '../public/cities.js';
import {buildRoutes,groupApplicationRoutes} from '../public/routes.js';
const now=Date.parse('2026-10-06T12:00:00Z');
const c={app:'firefox',pid:7,scope:'Internet',state:'Observed',protocol:'UDP',remoteAddress:'8.8.8.8',remotePort:443,domainCandidates:['googlevideo.com'],receiveRate:100,sendRate:20,receivedBytes60m:200,sentBytes60m:40};
const snapshot={connections:[c],processes:{7:'firefox'},adapters:[]};
const batch={type:'traffic',elapsed:2,flows:[{...c,receivedBytes:200,sentBytes:40}]};
test('all twenty city stages use byte boundaries and unknown capture stays unknown',()=>{
  assert.equal(CITY_STAGES.length,20);
  assert.equal(new Set(CITY_STAGES.map((_,i)=>cityArtwork(i))).size,20);
  assert.equal(cityStage(null).known,false);
  for(const [index,stage] of CITY_STAGES.entries()) {
    assert.equal(cityStage(stage.at).index,index);
    if(index)assert.equal(cityStage(stage.at-1).index,index-1);
  }
  assert.equal(cityStage(8*1024**2).progress,.5);
  assert.equal(cityStage(-1).index,0);
  assert.equal(cityStage(Infinity).known,false);
  assert.equal(cityStage(CITY_STAGES.at(-1).at).progress,1);
  assert.equal(cityStage(0).nextAt,16*1024**2);
});
test('construction scales from houses to multiple tower sites and cranes',()=>{
  const small=cityConstruction(0,.2),town=cityConstruction(8,.2),giant=cityConstruction(18,.2);
  assert.equal(small.cranes,0);assert.equal(small.sites.length,2);
  assert.ok(small.sites.every(s=>s.house));
  assert.ok(town.cranes>=3);assert.equal(giant.cranes,6);
  assert.equal(giant.sites.length,6);assert.equal(giant.vehicles,3);
  assert.ok(giant.sites.some(s=>!s.house));assert.ok(giant.sites.some(s=>s.house));
  assert.equal((cityArtwork(18,.2).match(/class="site-crane"/g)||[]).length,6);
  assert.match(cityArtwork(18,.2),/site-scaffolding/);assert.match(cityArtwork(18,.2),/excavator-arm/);
  assert.match(cityArtwork(18,.2),/mixer-drum/);
});
test('measured progress steadily finishes staggered projects before the next level',()=>{
  for(let stage=0;stage<19;stage++) {
    let previous=cityConstruction(stage,0);
    for(const progress of [.1,.3,.5,.7,.9,1]) {
      const build=cityConstruction(stage,progress);
      assert.ok(build.sites.every((site,i)=>site.built>=previous.sites[i].built));
      previous=build;
    }
    assert.ok(previous.sites.every(site=>site.built===1));
    assert.equal(previous.phase,'Complete');
    assert.ok(cityConstruction(stage,0).sites.every(site=>site.built===0));
  }
  assert.equal(cityConstruction(10,.1).phase,'Foundations');
  assert.equal(cityConstruction(10,.3).phase,'Framing');
  assert.equal(cityConstruction(10,.6).phase,'Building floors');
  assert.equal(cityConstruction(10,.9).phase,'Finishing');
  assert.equal(cityConstruction(19,0).phase,'Complete');
  assert.equal(cityConstruction(10,NaN).progress,0);
});
test('rising illustrated skylines use separate clipping per city and unknown totals stay unbuilt',()=>{
  const a=renderCity({key:'application|firefox',bytes:48*1024**2}),b=renderCity({key:'application|code',bytes:48*1024**2});
  assert.match(a,/artwork\/cities\/cabin\.png/);assert.match(a,/artwork\/cities\/house\.png/);
  assert.notEqual(a.match(/clipPath id="([^"]+)"/)[1],b.match(/clipPath id="([^"]+)"/)[1]);
  assert.notEqual(cityArtwork(10,0),cityArtwork(10,.5));
  const unknown=renderCity({key:'unknown',bytes:null});
  assert.match(unknown,/awaiting measured supplies/);
  assert.ok([...unknown.matchAll(/data-build-progress="([^"]+)"/g)].every(m=>Number(m[1])===0));
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
    const routes=buildRoutes([c],{cityUsage});assert.equal(routes[0].cityBytes,400);
    assert.equal(routes[0].totalBytes60m,240);assert.equal(groupApplicationRoutes(routes)[0].cityBytes,400);
  }
  assert.equal(buildRoutes([c],{detail:'endpoint',cityUsage})[0].cityBytes,400);
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

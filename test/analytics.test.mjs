import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { AnalyticsStore } from '../lib/analytics.mjs';
import { analyze, parseSearch } from '../public/analytics-model.js';
import { createAppServer } from '../lib/http.mjs';

const GB=1024**3,now=Date.parse('2026-10-31T23:00:00Z');
function row(date,app,service,received,sent=0,extra={}) {const at=Date.parse(date);return {at,app,service:{key:service,label:service},received,sent,scope:'Internet',protocol:'TCP',pids:[42],addresses:['1.2.3.4'],ports:[443],hostnames:[service+'.com'],firstSeen:at,lastSeen:at+1000,...extra};}
const records=[row('2026-10-06T14:00:00Z','firefox','YouTube',.7*GB),row('2026-10-06T15:00:00Z','firefox','Figma',.6*GB),row('2026-10-13T14:00:00Z','firefox','YouTube',GB),row('2026-10-07T14:00:00Z','firefox','YouTube',2*GB),row('2026-09-29T14:00:00Z','firefox','YouTube',3*GB),row('2026-10-06T14:00:00Z','OneDrive','Microsoft',0,4*GB)];
test('Firefox sentence compiles into calendar filters and combines services before a strict threshold',()=>{
  const filters=parseSearch('all the times Firefox used more than 1GB on a Tuesday in October');
  assert.deepEqual(filters,{min:'1',unit:'GB',weekday:'2',month:'10',query:'Firefox',range:'all'});
  const result=analyze(records,{...filters,timezone:'America/New_York'},now);
  assert.equal(result.matches.length,1);assert.equal(result.matches[0].period,'2026-10-06');assert.ok(Math.abs(result.total-1.3*GB)<1);assert.equal(result.services.length,2);
  assert.equal(analyze(records,{...filters,timezone:'America/New_York',bucket:'hour'},now).matches.length,0);
});
test('filters apply to direction, dates, endpoints, protocols and metadata; every visual conserves matching bytes',()=>{
  const r=analyze(records,{range:'all',from:'2026-10-01',to:'2026-10-10',direction:'sent',min:'1',unit:'GB',timezone:'UTC'},now);
  assert.equal(r.matches.length,1);assert.equal(r.apps[0].label,'OneDrive');assert.equal(r.total,4*GB);
  for(const key of ['timeline','apps','services','hours','week'])assert.equal(r[key].reduce((n,p)=>n+p.received+p.sent,0),r.total,key);
  assert.equal(r.heat.flat().reduce((a,b)=>a+b,0),r.total);assert.deepEqual(r.metadata.pids,[42]);
  assert.equal(analyze(records,{range:'all',query:'1.2.3.4',protocol:'UDP',timezone:'UTC'},now).total,0);
  assert.equal(analyze(records,{range:'all',app:'firefox',service:'Figma',timezone:'UTC'},now).total,.6*GB);
});
test('calendar filtering uses the selected timezone, and repeated DST hours stay distinct',()=>{
  const data=[row('2026-10-07T02:00:00Z','firefox','YouTube',2*GB)];
  assert.equal(analyze(data,{range:'all',weekday:'2',timezone:'America/New_York'},now).matches.length,1);
  assert.equal(analyze(data,{range:'all',weekday:'2',timezone:'UTC'},now).matches.length,0);
  const dst=[row('2026-11-01T05:00:00Z','firefox','YouTube',1),row('2026-11-01T06:00:00Z','firefox','YouTube',2)];
  const result=analyze(dst,{range:'all',bucket:'hour',timezone:'America/New_York'},Date.parse('2026-11-02'));
  assert.equal(result.matches.length,2);assert.equal(result.hours[1].received,3);
});
test('measured hourly history survives disk reload and PID reuse without reattributing old traffic',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'netkonnect-analytics-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=new AnalyticsStore(directory);await store.load(now);
  const flow={pid:42,protocol:'UDP',remoteAddress:'8.8.8.8',remotePort:443,localAddress:'192.168.1.2',localPort:5000,receivedBytes:2*GB,sentBytes:100};
  const at=Date.parse('2026-10-06T14:30:00Z');
  store.ingest({type:'traffic',elapsed:2,flows:[flow]},at,{processes:{42:'firefox'},connections:[],dnsRecords:[{address:'8.8.8.8',name:'video.googlevideo.com'}]});
  store.ingest({type:'traffic',elapsed:2,flows:[flow]},at+2000,{processes:{42:'Slack'},connections:[]});
  await store.flush();
  const reloaded=new AnalyticsStore(directory);await reloaded.load(now);
  const result=reloaded.query({range:'all',timezone:'UTC'},now);
  assert.equal(result.apps.length,2);assert.equal(result.total,4*GB+200);assert.equal(result.archive.seconds,4);assert.equal(result.metadata.hostnames[0],'video.googlevideo.com');
  assert.equal(result.apps.find(a=>a.key==='firefox').received,2*GB);
  reloaded.ingest({type:'status',available:false},now);assert.equal(reloaded.query({range:'all',timezone:'UTC'},now).total,result.total);
});
test('saved storage failures are surfaced without discarding in-memory measured traffic',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'netkonnect-analytics-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await writeFile(join(directory,'2026-10-06.json'),'broken JSON');const store=new AnalyticsStore(directory);await store.load(now);
  assert.match(store.error,/could not be read/);
  assert.equal(store.query({range:'all'},now).total,0);
});
test('searching one IP or PID excludes other endpoint traffic even when its app and service match',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'netkonnect-analytics-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=new AnalyticsStore(directory);await store.load(now);
  const a={pid:42,protocol:'TCP',remoteAddress:'1.2.3.4',remotePort:443,receivedBytes:100,sentBytes:0},b={...a,pid:55,remoteAddress:'1.2.3.5',receivedBytes:900};
  store.ingest({type:'traffic',elapsed:2,flows:[a,b]},now,{processes:{42:'firefox',55:'firefox'},dnsRecords:[{address:a.remoteAddress,name:'github.com'},{address:b.remoteAddress,name:'github.com'}]});
  assert.equal(store.query({range:'all',query:'1.2.3.4',timezone:'UTC'},now).total,100);
  assert.equal(store.query({range:'all',query:'55',timezone:'UTC'},now).total,900);
  assert.equal(store.query({range:'all',service:'github',timezone:'UTC'},now).total,1000);
});
test('analytics API protects origins, paginates results, validates filters and exports all matching records safely',async t=>{
  const data=Array.from({length:75},(_,i)=>row('2026-10-06T14:00:00Z',i?'app'+i:'=formula','Service',GB));
  const server=createAppServer({getSnapshot:()=>({}),getAnalytics:f=>({...analyze(data,f,now),catalog:{apps:[],services:[]},archive:{}})});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/analytics?range=all&timezone=UTC`;
  const response=await fetch(url),body=await response.json();assert.equal(body.matches.length,50);assert.equal(body.matchCount,75);
  assert.equal((await (await fetch(url+'&offset=50')).json()).matches.length,25);
  assert.equal((await fetch(url,{headers:{Origin:'https://unrelated.example'}})).status,403);
  assert.equal((await fetch(url+'&min=-1')).status,400);assert.equal((await fetch(url+'&timezone=invalid')).status,400);
  assert.equal((await fetch(url+'&from=2026-02-30')).status,400);assert.equal((await fetch(url+'&min=2&max=1')).status,400);
  const csv=await fetch(url+'&export=csv');assert.match(csv.headers.get('content-type'),/text\/csv/);
  const text=await csv.text();assert.equal(text.split('\r\n').length,76);assert.match(text,/"'=formula"/);
});

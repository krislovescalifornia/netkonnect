import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IconWishlist } from '../lib/icon-wishlist.mjs';
import { watercolorWishlist } from '../public/icon-wishlist.js';
const start=Date.parse('2026-10-07T21:00:00Z');
async function store(t,at=start) {
  const directory=await mkdtemp(join(tmpdir(),'nk-wishlist-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const wishlist=new IconWishlist(directory);await wishlist.load(at);return {wishlist,directory};
}
const connection=(app,pid=42)=>({app,pid,state:'Established',protocol:'TCP'});
const flow=(app,pid=42)=>({app,pid,receivedBytes:100,sentBytes:20});
test('activity merges processes, endpoints and overlapping snapshot/ETW windows without double counting',async t=>{
  const {wishlist:w}=await store(t);const now=start+10000;
  w.observe({connections:[connection('worker'),connection('worker',43),connection('firefox'),connection('Unattributed',0)]},8,now);
  w.ingest({type:'traffic',elapsed:2,flows:[flow('worker'),flow('worker',43)]},null,now+1000);
  const top=w.report(now).top10;assert.equal(top.length,1);assert.equal(top[0].activeSeconds,9);assert.equal(top[0].received,200);assert.equal(top[0].sent,40);
});
test('UDP bindings and listeners count no time; measured UDP transfers count; stopped collection never fills a gap',async t=>{
  const {wishlist:w}=await store(t);
  w.observe({connections:[{...connection('worker'),state:'Listen'},{...connection('udp'),protocol:'UDP',state:'Bound'}]},8,start+10000);
  assert.equal(w.report().top10.length,0);
  w.ingest({type:'traffic',elapsed:2,flows:[flow('udp')]},null,start+12000);
  w.observe({connections:[connection('worker')]},3600,start+3600000);
  assert.equal(w.report().top10.find(a=>a.key==='udp').activeSeconds,2);assert.equal(w.report().top10.find(a=>a.key==='worker').activeSeconds,8);
});
test('rankings keep every candidate, select the ten longest network times, and escape display names',async t=>{
  const {wishlist:w}=await store(t);
  for(let i=1;i<=15;i++)w.add('app'+i,42,start,start+i*1000,1000000/i);
  const list=w.report(start+20000).top10;assert.equal(list.length,10);assert.equal(list[0].key,'app15');assert.equal(list.at(-1).key,'app6');
  const html=watercolorWishlist({...w.report(),top10:[{...list[0],name:'<script>',process:'<script>'}]});assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('a restart preserves dates, totals and interval overlap; collection freezes at one calendar month',async t=>{
  const {wishlist:w,directory}=await store(t);w.observe({connections:[connection('worker')]},8,start+10000);await w.flush(start+10000);
  const restored=new IconWishlist(directory);await restored.load(start+86400000);assert.equal(restored.startedAt,start);assert.equal(restored.endsAt,Date.parse('2026-11-07T21:00:00Z'));
  restored.ingest({type:'traffic',elapsed:2,flows:[flow('worker')]},null,start+10000);assert.equal(restored.report().top10[0].activeSeconds,8);
  restored.observe({connections:[connection('worker')]},8,restored.endsAt+10000);assert.equal(restored.report().top10[0].activeSeconds,8);
  await restored.flush(restored.endsAt+10000);const saved=JSON.parse(await readFile(restored.file,'utf8'));assert.equal(saved.complete,true);assert.equal(saved.top10[0].activeSeconds,8);
});
test('month-end dates clamp to the next month and a damaged campaign is preserved',async t=>{
  const {wishlist:w}=await store(t,Date.parse('2026-01-31T12:00:00Z'));assert.equal(w.endsAt,Date.parse('2026-02-28T12:00:00Z'));
  await writeFile(w.file,'broken');const reopened=new IconWishlist(join(w.file,'..'));await reopened.load(start);assert.match(reopened.error,/could not be read/);
  reopened.observe({connections:[connection('worker')]},8,start+10000);await reopened.flush();assert.equal(await readFile(w.file,'utf8'),'broken');
});
test('temporary write failures retain activity and retry without starting a new campaign',async t=>{
  const {wishlist:w}=await store(t);w.observe({connections:[connection('worker')]},8,start+10000);
  await mkdir(w.file+'.tmp');await w.flush(start+10000);assert.match(w.error,/could not be saved/);
  w.observe({connections:[connection('worker')]},8,start+18000);await rm(w.file+'.tmp',{recursive:true});await w.flush(start+18000);
  assert.equal(w.error,null);assert.equal(JSON.parse(await readFile(w.file,'utf8')).top10[0].activeSeconds,16);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { AppIcons } from '../lib/app-icons.mjs';
import { appIdentity, brandBadge, setAppIcons, appIconFailed } from '../public/brands.js';
import { hostnameIdentity } from '../public/brands.js';
import { createAppServer } from '../lib/http.mjs';

const png=await readFile(new URL('../desktop/tray.png',import.meta.url));
async function cache(t,options) {
  const directory=await mkdtemp(join(tmpdir(),'nk-icons-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const icons=new AppIcons(directory,options);await icons.load();return {icons,directory};
}
const owner={name:'unknown-worker',pid:42,path:'C:\\Apps\\worker.exe'};
test('watercolor wins over Windows, unknown apps use cached Windows icons, and services never borrow an app icon',()=>{
  const url='/app-icons/'+ 'a'.repeat(64)+'.png';setAppIcons({firefox:url,'unknown-worker':url,'foo.example':url});
  assert.match(brandBadge(appIdentity('firefox')),/data-icon-tier="watercolor"/);
  assert.doesNotMatch(brandBadge(appIdentity('firefox')),/os-app-icon/);
  assert.match(brandBadge(appIdentity('unknown-worker')),/data-icon-tier="windows"/);
  assert.match(brandBadge(appIdentity('unknown-worker')),/brand-monogram.*os-app-icon/);
  assert.match(brandBadge(hostnameIdentity('foo.example')),/data-icon-tier="letter"/);
  assert.doesNotMatch(brandBadge({label:'Unsafe',osIcon:'file:///private.png'}),/os-app-icon/);
  setAppIcons({});assert.match(brandBadge(appIdentity('unknown-worker')),/data-icon-tier="letter"/);
  const broken='/app-icons/'+'b'.repeat(64)+'.png';setAppIcons({'unknown-worker':broken});appIconFailed(broken);
  assert.doesNotMatch(brandBadge(appIdentity('unknown-worker')),/os-app-icon/);setAppIcons({});
});
test('concurrent processes sharing an executable extract once, persist across reopening and serve opaque IDs',async t=>{
  let calls=0;const readIcons=async requests=>{calls++;return requests.map(r=>({id:r.id,png:png.toString('base64')}));};
  const {icons,directory}=await cache(t,{readIcons});
  const ids=await Promise.all([icons.request(owner),icons.request({...owner,pid:43})]);assert.equal(calls,1);assert.equal(ids[0],ids[1]);
  assert.deepEqual(await icons.read(ids[0]),png);assert.equal(await icons.read('../secret'),null);
  await icons.flush();const reopened=new AppIcons(directory,{readIcons});await reopened.load();
  assert.equal(await reopened.request(owner),ids[0]);assert.equal(calls,1);assert.ok(reopened.catalog()['unknown-worker']);
});
test('missing resources are negatively cached and do not trigger Electron; a helper failure uses the local Electron fallback',async t=>{
  let now=1000,calls=0,fallbacks=0;
  const {icons}=await cache(t,{clock:()=>now,readIcons:async requests=>{calls++;return requests.map(r=>({id:r.id,status:'no-icon'}));},getFileIcon:async()=>{fallbacks++;return {isEmpty:()=>false,toPNG:()=>png};}});
  assert.equal(await icons.request({...owner,localPath:true}),null);assert.equal(await icons.request({...owner,localPath:true}),null);assert.equal(calls,1);assert.equal(fallbacks,0);
  now+=600001;await icons.request({...owner,localPath:true});assert.equal(calls,2);
  const {icons:failed}=await cache(t,{readIcons:async()=>{throw new Error('helper unavailable');},getFileIcon:async()=>({isEmpty:()=>false,toPNG:()=>png})});
  assert.ok(await failed.request({...owner,localPath:true}));
  assert.equal(await failed.request({...owner,path:'\\\\server\\share\\app.exe',localPath:true}),null);
});
test('new requests after a completed batch drain and changed files invalidate the persisted extraction cache',async t=>{
  let calls=0,now=1000;const {icons,directory}=await cache(t,{clock:()=>now,readIcons:async requests=>{calls++;return requests.map(r=>({id:r.id,png:png.toString('base64')}));}});
  await icons.request(owner);await icons.request({...owner,path:'C:\\Apps\\second.exe',name:'second'});assert.equal(calls,2);
  const file=join(directory,'fixture.exe');await writeFile(file,'first');const local={...owner,path:file,localPath:true};
  await icons.request(local);await icons.request({...local,pid:43});assert.equal(calls,3);
  await writeFile(file,'new file with different resource metadata');now+=300001;await icons.request(local);assert.equal(calls,4);
  await icons.flush();const reopened=new AppIcons(directory,{clock:()=>now,readIcons:async()=>{throw new Error('unchanged file must not re-extract');}});await reopened.load();assert.ok(await reopened.request(local));
});
test('watercolor apps never enter extraction; malformed image output cannot enter the asset cache',async t=>{
  let calls=0;const {icons}=await cache(t,{readIcons:async requests=>{calls++;return requests.map(r=>({id:r.id,png:Buffer.from('<svg/>').toString('base64')}));}});
  icons.observe({connections:[{app:'firefox',pid:42,owner}]});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,0);
  assert.equal(await icons.request(owner),null);assert.deepEqual(icons.catalog(),{});
});
test('a removed cached image returns to a letter and is regenerated on the next observation',async t=>{
  let calls=0;const {icons}=await cache(t,{readIcons:async requests=>{calls++;return requests.map(r=>({id:r.id,png:png.toString('base64')}));}});
  const id=await icons.request(owner);await rm(join(icons.directory,id+'.png'));assert.equal(await icons.read(id),null);assert.deepEqual(icons.catalog(),{});
  assert.equal(await icons.request(owner),id);assert.equal(calls,2);assert.deepEqual(await icons.read(id),png);
});
test('HTTP icons are cached PNGs and traversal, wrong methods and foreign origins cannot access the source',async t=>{
  const {icons}=await cache(t,{readIcons:async requests=>requests.map(r=>({id:r.id,png:png.toString('base64')}))});const id=await icons.request(owner);
  const server=createAppServer({getSnapshot:()=>({}),getIcon:id=>icons.read(id)});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;const response=await fetch(base+'/app-icons/'+id+'.png');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/immutable/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  assert.equal((await fetch(base+'/app-icons/%2e%2e/private.png')).status,404);
  assert.equal((await fetch(base+'/app-icons/'+id+'.png',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/app-icons/'+id+'.png',{headers:{Origin:'https://outside.example'}})).status,403);
});

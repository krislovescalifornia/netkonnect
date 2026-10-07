import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CITY_ART,FLEET_ART,PROP_ART,ILLUSTRATION_ASSETS,CITY_ART_IDS} from '../public/illustration-art.js';
import {CITY_STAGES,cityArtwork} from '../public/cities.js';
import {VEHICLE_STAGES,vehicle} from '../public/vehicles.js';
import {TRUCK_ART} from '../public/truck-art.js';
import {createAppServer} from '../lib/http.mjs';

test('every city and remaining transport tier has measured transparent artwork',async()=>{
  assert.equal(CITY_ART_IDS.length,CITY_STAGES.length);
  assert.deepEqual(new Set(Object.keys(CITY_ART)),new Set(CITY_ART_IDS));
  assert.deepEqual(new Set(Object.keys(FLEET_ART)),new Set(VEHICLE_STAGES.filter(s=>!TRUCK_ART[s.id]).map(s=>s.id)));
  assert.deepEqual(new Set(Object.keys(PROP_ART)),new Set(['crew','crane','airdrop']));
  for(const [folder,table] of [['cities',CITY_ART],['fleet',FLEET_ART],['fleet',PROP_ART]]) {
    for(const [id,art] of Object.entries(table))for(const [suffix,strip] of [['',art],...(art.empty?[['-empty',art.empty]]:[])]){
      const png=await readFile(new URL(`../public/artwork/${folder}/${id}${suffix}.png`,import.meta.url));
      assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],strip.size);
      assert.equal(png[25],6,'preserve genuine alpha');
      for(const [x,y,w,h] of strip.frames)assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=strip.size[0]+.001&&y+h<=strip.size[1]+.001);
      if(strip.clips)for(const [x,y,w,h] of strip.clips)assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=strip.size[0]&&y+h<=strip.size[1]);
    }
  }
});

test('loaded and empty side-profile fleet keeps scale and clips separate rows',()=>{
  for(const art of Object.values(FLEET_ART).filter(art=>art.empty))for(let i=0;i<3;i++) {
    assert.deepEqual(art.frames[i].slice(2),art.empty.frames[i].slice(2));
    assert.equal(art.frames[i][0],art.empty.frames[i][0]);
    assert.ok(art.clips[i][1]+art.clips[i][3]<art.empty.clips[i][1]);
  }
});

test('fleet variants remain deterministic and cart unloading retains an empty body',()=>{
  for(const id of Object.keys(FLEET_ART)){
    assert.equal(new Set([0,1,2].map(seed=>vehicle(id,false,seed))).size,3);
    for(const incoming of [true,false])assert.match(vehicle(id,incoming,2),new RegExp(`artwork/fleet/${id}\\.png`));
    assert.equal(vehicle(id,false,-2),vehicle(id,false,2));
    assert.doesNotMatch(vehicle(id,false,Infinity),/NaN|undefined/);
  }
  for(const id of ['wheelbarrow','handcart','cargo-bicycle','cargo-trike','scooter','freight-train','helicopter','tiltrotor','barge','freighter','mega-ship']) {
    assert.ok(FLEET_ART[id].empty,'open cargo must unload: '+id);
    assert.match(vehicle(id,true,0),new RegExp(id+'-empty\\.png'));
    assert.match(vehicle(id,true,0),/class="vehicle-cargo"><svg/);
  }
  for(let i=0;i<CITY_STAGES.length;i++)assert.match(cityArtwork(i),new RegExp(`artwork/cities/${CITY_ART_IDS[i]}\\.png`));
});

test('all new art loads through the local allowlist and unrelated files stay private',async t=>{
  const server=createAppServer({getSnapshot:()=>({})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const file of ['illustration-art.js','artwork/manifest.js',...ILLUSTRATION_ASSETS]){
    const response=await fetch(`${base}/${file}`);assert.equal(response.status,200,file);
    assert.match(response.headers.get('content-type'),file.endsWith('.png')?/^image\/png/:/^text\/javascript/);
    await response.arrayBuffer();
  }
  assert.equal((await fetch(base+'/artwork/generation-prompts.json')).status,404);
  assert.equal((await fetch(base+'/artwork/cities/unlisted.png')).status,404);
});

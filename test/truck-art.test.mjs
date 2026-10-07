import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TRUCK_ART,TRUCK_ASSETS} from '../public/truck-art.js';
import {vehicle,transportSpec} from '../public/vehicles.js';
import {createAppServer} from '../lib/http.mjs';

test('illustrated truck frames fit genuine RGBA strips, including empty beds',async()=>{
  for(const [id,art] of Object.entries(TRUCK_ART))for(const [suffix,strip] of [['',art],...(art.empty?[['-empty',art.empty]]:[])]){
    const png=await readFile(new URL(`../public/artwork/trucks/${id}${suffix}.png`,import.meta.url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],strip.size);
    assert.equal(png[25],6,'sprites must preserve alpha');
    assert.equal(strip.frames.length,3);
    for(const [x,y,w,h] of strip.frames){assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=strip.size[0]&&y+h<=strip.size[1]);}
    if(strip.clips)for(const [x,y,w,h] of strip.clips)assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=strip.size[0]&&y+h<=strip.size[1]);
  }
});

test('loaded and empty side-profile trucks share scale and isolate their source rows',()=>{
  for(const art of Object.values(TRUCK_ART).filter(art=>art.empty)) {
    for(let i=0;i<3;i++) {
      assert.deepEqual(art.frames[i].slice(2),art.empty.frames[i].slice(2),'unloading must keep size and scale');
      assert.equal(art.frames[i][0],art.empty.frames[i][0],'unloading must keep horizontal alignment');
      assert.ok(art.clips[i][1]+art.clips[i][3]<art.empty.clips[i][1],'sprite rows must be isolated');
    }
  }
});

test('all illustrated tiers retain their identity, paint variation and delivery layer',()=>{
  for(const id of Object.keys(TRUCK_ART)){
    assert.equal(new Set([0,1,2].map(seed=>vehicle(id,false,seed))).size,3);
    for(const incoming of [true,false]){
      const svg=vehicle(id,incoming,2);
      assert.match(svg,new RegExp(`artwork/trucks/${id}\\.png`));
      assert.match(svg,/class="vehicle-cargo"/);
      if(TRUCK_ART[id].empty)assert.match(svg,new RegExp(`artwork/trucks/${id}-empty\\.png`));
    }
  }
  assert.equal(transportSpec('truck').id,'pickup');
  assert.equal(vehicle('truck',false,1),vehicle('pickup',false,1));
});

test('local web server serves every truck strip as PNG and keeps unlisted paths denied',async t=>{
  const server=createAppServer({getSnapshot:()=>({})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const file of TRUCK_ASSETS){
    const response=await fetch(`${base}/${file}`);
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^image\/png/);
    const png=Buffer.from(await response.arrayBuffer());assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
  assert.equal((await fetch(base+'/truck-art.js')).status,200);
  assert.equal((await fetch(base+'/artwork/trucks/unlisted.png')).status,404);
});

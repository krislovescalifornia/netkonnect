import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CRANE_ART,CRANE_ASSETS,craneForSite,craneArtwork} from '../public/crane-art.js';
import {requiredAssets} from '../desktop/bundle.mjs';

test('ten additional original transparent cranes ship offline with registered hoists',async()=>{
  assert.equal(CRANE_ART.length,11);
  const hashes=new Set();
  for(const art of CRANE_ART){
    const path=art.file||`artwork/cranes/${art.id}.png`,png=await readFile(new URL('../public/'+path,import.meta.url));
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],art.size);
    assert.equal(png[25],6,'RGBA source');hashes.add(createHash('sha256').update(png).digest('hex'));
    const {rig}=craneArtwork(art,166);
    assert.ok(rig.y+rig.rest<190&&rig.rest>rig.lift);
    assert.ok(requiredAssets.includes('public/'+path));
  }
  assert.equal(hashes.size,11);
  assert.ok(CRANE_ASSETS.includes('crane-art.js'));
});

test('cities select diverse cranes deterministically with simple equipment at early levels',()=>{
  const used=new Set();
  for(let stage=2;stage<20;stage++)for(const key of ['firefox','Code','OneDrive','catalog']){
    const count=Math.min(6,1+Math.floor((stage-2)/3));
    const designs=Array.from({length:count},(_,i)=>craneForSite(stage,i,key));
    assert.equal(new Set(designs).size,count,'Distinct equipment across neighboring work yards');
    for(const [i,art] of designs.entries()){
      used.add(art.id);assert.equal(craneForSite(stage,i,key),art);
      if(stage<4)assert.ok(['timber-derrick','sage-jib'].includes(art.id));
    }
  }
  assert.equal(used.size,11);
});

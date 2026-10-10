import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SETTLEMENT_FRAMES} from '../public/artwork/world/settlements/frames.js';
import {renderCity,CITY_STAGES} from '../public/cities.js';
import {laneLabelPosition,worldRoute,routePoint} from '../public/world.js';
import {VEHICLE_STAGES} from '../public/vehicles.js';
import {LIVING_FRAMES} from '../public/artwork/living/frames.js';
import {LIVING_PROFILES,livingSprite} from '../public/living-city.js';

test('all twenty live cities assemble distinct transparent architecture at natural proportions',async()=>{
  assert.equal(LIVING_FRAMES.length,20);assert.equal(LIVING_PROFILES.length,20);
  const cells=new Set();
  for(const [stage,modules] of LIVING_FRAMES.entries()) {
    const markup=renderCity({key:'stage-'+stage,bytes:CITY_STAGES[stage].at,convoy:'data-route-key="stage-'+stage+'"'});
    assert.ok(markup.includes('data-place="'+LIVING_PROFILES[stage].id+'"'));
    assert.match(markup,/class="world-landscape"/);
    assert.match(markup,/city-established" opacity="1"/);
    assert.doesNotMatch(markup,/city-rising|world\/backgrounds|world\/settlements\/settlements/);
    for(const [column,frame] of modules.entries()) {
    const png=await readFile(new URL('../public/'+frame.file,import.meta.url));
    assert.equal(png[25],6,'genuine RGBA source');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],frame.size);
    assert.ok(markup.includes(frame.file));
    cells.add(frame.file);
    const sprite=livingSprite(stage,column,150,130),width=+sprite.match(/ width="([^"]+)"/)[1],height=+sprite.match(/ height="([^"]+)"/)[1];
    assert.ok(Math.abs(width/height-frame.size[0]/frame.size[1])<.001,'no independent horizontal stretching');
    }
  }
  assert.equal(cells.size,100);
  assert.equal(new Set(LIVING_PROFILES.map(p=>p.id)).size,20);
});

test('every fleet type anchors both speed readings to its actual journey contact line',()=>{
  for(const spec of VEHICLE_STAGES)for(const direction of ['download','upload']) {
    const baseline=routePoint(worldRoute(direction,spec.mode),.5).y;
    assert.ok(Math.abs(laneLabelPosition(spec.id,direction)-(baseline+20)/280*100)<1e-9);
  }
});


test('every measured city retains street life and localized measured construction without fading established buildings',async()=>{
  const png=await readFile(new URL('../public/artwork/world/settlements/residents-v1.png',import.meta.url));
  assert.equal(png[25],6);
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1536,1024]);
  for(let stage=0;stage<20;stage++) {
    const at=CITY_STAGES[stage].at,next=CITY_STAGES[stage+1]?.at;
    const markup=progress=>renderCity({key:'life-'+stage,bytes:at+(next?next-at:0)*progress,convoy:'data-route-key="life-'+stage+'"'});
    const early=markup(.2),late=markup(.8);
    assert.ok((early.match(/resident-home/g)||[]).length>=4,'visible street population at every stage');
    for(const layer of ['city-residents','city-projects','construction-site','city-site-vehicles','crew-carrier','city-helpers','resident-stride'])assert.ok(early.includes(layer),layer+' retained');
    assert.match(early,/city-activity-anchor/);
    if(next) {
      assert.notEqual(early,late,'measured data advances construction');
      assert.notEqual(early.match(/data-build-progress="([^"]+)"/)[1],late.match(/data-build-progress="([^"]+)"/)[1]);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {worldTime,infrastructure,worldRoute,routePoint,worldRoads,WORLD_ASSETS,WORLD_BACKGROUNDS,worldBackground,WORLD_ROUTE_BASELINES} from '../public/world.js';
import {renderCity,CITY_STAGES} from '../public/cities.js';
import {createAppServer} from '../lib/http.mjs';
test('local sky phases cover midnight, sunrise, daytime and sunset boundaries',()=>{
  for(const [hour,minute,phase] of [[0,0,'night'],[4,59,'night'],[5,0,'sunrise'],[7,59,'sunrise'],[8,0,'day'],[16,59,'day'],[17,0,'sunset'],[19,59,'sunset'],[20,0,'night'],[23,59,'night']])
    assert.equal(worldTime(new Date(2026,9,8,hour,minute)).phase,phase);
});
test('twenty measured city stages grow roads, trees, parks, rail and river ports',()=>{
  assert.deepEqual([0,2,4,6,10,14].map(i=>infrastructure(i).tier),['trail','gravel','road','boulevard','highway','superhighway']);
  assert.equal(infrastructure(11).port,false);assert.equal(infrastructure(12).port,true);
  assert.equal(infrastructure(9).rail,false);assert.equal(infrastructure(10).rail,true);
  assert.ok(infrastructure(19).trees>infrastructure(0).trees);
  assert.ok(infrastructure(19).lamps>infrastructure(8).lamps);
  assert.match(worldRoads(0),/class="world-river" opacity="0"/);
  assert.match(worldRoads(0,655,['water']),/class="world-river" opacity="1"/);
});
test('level corridors connect app and city without rotating side-profile sprites',()=>{
  for(const mode of ['road','rail','water','air'])for(const direction of ['download','upload']) {
    const curve=worldRoute(direction,mode,655);
    assert.equal(routePoint(curve,0).x,28);assert.equal(routePoint(curve,1).x,655);
    let previous=0;
    for(let t=0;t<=1;t+=.025){const p=routePoint(curve,t);assert.ok(p.x>=previous);assert.ok(Number.isFinite(p.angle));previous=p.x;}
    for(const t of [0,.1,.25,.5,.75,.9,1]) {
      const pose=routePoint(curve,t);
      assert.ok(Math.abs(pose.y-WORLD_ROUTE_BASELINES[mode][direction])<1e-10);
      assert.equal(pose.angle,0,'static side-profile artwork stays level');
    }
  }
  assert.equal(new Set(['road','rail','water','air'].map(mode=>routePoint(worldRoute('download',mode),.5).y)).size,4);
});
test('city scene has full-bleed offline artwork, an independent return route and local time',()=>{
  const markup=renderCity({key:'world',bytes:128*1024**3,convoy:'data-route-key="world"',date:new Date(2026,9,8,21)});
  assert.match(markup,/data-time="night"/);assert.match(markup,/world-city" transform="translate\(575 28\)"/);
  assert.ok(markup.includes(worldBackground(12)));assert.match(markup,/world-birds/);assert.match(markup,/outgoing-road/);
});
test('watercolor world assets retain their source pixels and load through the local allowlist',async t=>{
  const server=createAppServer({getSnapshot:()=>({})});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  for(const file of ['world.js',...WORLD_ASSETS])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/'+file)).status,200,file);
  const sprite=await readFile(new URL('../public/artwork/world/environment-v1.png',import.meta.url));assert.equal(sprite[25],6);
  assert.deepEqual([sprite.readUInt32BE(16),sprite.readUInt32BE(20)],[1536,1024]);
});

test('each city level uses a distinct generated panorama in matching stage order',async()=>{
  assert.equal(WORLD_BACKGROUNDS.length,20);
  assert.deepEqual(WORLD_BACKGROUNDS.map(b=>b.name),CITY_STAGES.map(s=>s.name));
  const hashes=new Set();
  for(const [stage,background] of WORLD_BACKGROUNDS.entries()) {
    assert.equal(background.level,stage+1);
    assert.equal(worldBackground(stage),background.file);
    assert.ok(WORLD_ASSETS.includes(background.file));
    const png=await readFile(new URL('../public/'+background.file,import.meta.url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.ok(png.readUInt32BE(16)>=2000);assert.ok(png.readUInt32BE(20)>=600);
    assert.ok(Math.abs(png.readUInt32BE(16)/png.readUInt32BE(20)-3)<.1);
    hashes.add(createHash('sha256').update(png).digest('hex'));
    const markup=renderCity({key:'stage-'+stage,bytes:CITY_STAGES[stage].at,convoy:'data-route-key="stage-'+stage+'"'});
    assert.ok(markup.includes('href="'+background.file+'"'));
  }
  assert.equal(hashes.size,20,'all twenty levels have different source artwork');
  assert.notEqual(worldBackground(1),worldBackground(14),'level 2 and level 15 have separate scenery');
  assert.equal(worldBackground(-1),worldBackground(0));assert.equal(worldBackground(99),worldBackground(19));
  assert.equal(worldBackground(NaN),worldBackground(0));
});

test('airports and spaceports unlock with growth or a preview without replacing road corridors',()=>{
  assert.equal(infrastructure(10).airport,false);assert.equal(infrastructure(11).airport,true);
  assert.equal(infrastructure(17).spaceport,false);assert.equal(infrastructure(18).spaceport,true);
  assert.match(worldRoads(0),/class="world-airport" opacity="0"/);
  assert.match(worldRoads(0,655,['air']),/class="world-airport" opacity="1"/);
  for(let stage=0;stage<20;stage++) {
    const roads=worldRoads(stage);
    assert.match(roads,/road-surfaces-v1.png/);
    assert.match(roads,/data-render-key="\w+-download"/);
    assert.match(roads,/data-render-key="\w+-upload"/);
  }
});

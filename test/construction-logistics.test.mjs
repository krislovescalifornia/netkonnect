import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PROJECT_NAMES,CONSTRUCTION_ASSETS,MATERIALS,deliveryMaterial,materialTransferPose,terminalGeometry} from '../public/construction-art.js';
import {PROJECT_FRAMES,LOGISTICS_FRAMES} from '../public/artwork/construction/projects/frames.js';
import {cityConstruction,cityArtwork} from '../public/cities.js';
import {createAppServer} from '../lib/http.mjs';
test('twenty distinct registered watercolor projects replace the repeated house and tower sequences',async()=>{
  assert.equal(PROJECT_NAMES.length,20);assert.equal(PROJECT_FRAMES.length,20);
  const hashes=[];
  for(const [stage,project] of PROJECT_FRAMES.entries()){
    assert.equal(project.frames.length,4);
    assert.ok(cityConstruction(stage,.4).sites.some(site=>site.design===stage));
    if(stage>0){const sites=cityConstruction(stage,.4).sites;assert.equal(new Set(sites.map(site=>site.design)).size,sites.length,'Neighboring yards have different architectural projects');}
    assert.equal(new Set(project.frames.map(f=>f.source.join(','))).size,1,'Phase dimensions and baseline stay registered');
    for(const frame of project.frames)hashes.push(createHash('sha256').update(await readFile(new URL('../public/'+frame.file,import.meta.url))).digest('hex'));
    const rendered=cityArtwork(stage,.4);
    assert.ok(rendered.includes(project.frames[1].file));
    assert.doesNotMatch(rendered,/details\/(house-build|tower-build|site-supplies|delivery-parcel)\.png/);
  }
  assert.equal(new Set(hashes).size,80,'All eighty phase textures have distinct source pixels');
});
test('every material comes from a stable delivery selection and no stock is fabricated by rendering',()=>{
  const materials=new Set();
  for(let stage=0;stage<20;stage++)for(let id=0;id<20;id++)materials.add(deliveryMaterial(stage,id));
  assert.deepEqual(materials,new Set(MATERIALS));
  assert.equal(deliveryMaterial(14,7),deliveryMaterial(14,7));
  const scene=cityArtwork(14,.3,'supply-test',true);
  assert.match(scene,/class="site-stock"[^>]*><\/g>/);
  assert.match(scene,/class="crane-load"[^>]*opacity="0"/);
});
test('cargo follows a continuous lift, crew handoff and installation trip for each transport mode',()=>{
  for(const mode of ['road','rail','water','air']){
    const from={x:600,y:150},to={x:300,y:90},hoist={x:576,y:95};
    const initial=materialTransferPose(.65,{mode,from,to,hoist});assert.equal(initial.x,from.x);assert.equal(initial.y,from.y);
    const handoff=materialTransferPose(.65+.33*.35,{mode,from,to,hoist});
    assert.ok(Math.abs(handoff.x-576)<.000001);
    assert.equal(materialTransferPose(.84,{mode,from,to,hoist}).carrying,true);
    let previous=initial;
    for(let i=1;i<=330;i++){
      const pose=materialTransferPose(.65+i*.001,{mode,from,to,hoist});
      assert.ok(Math.hypot(pose.x-previous.x,pose.y-previous.y)<3);previous=pose;
    }
    assert.equal(previous.x,to.x);assert.equal(previous.y,to.y);
    assert.equal(materialTransferPose(.5,{mode,from,to}).opacity,0);
  }
  for(const mode of ['rail','water']){
    const bay=terminalGeometry(mode,655);
    assert.ok(bay.rig.y<bay.y);assert.ok(Number.isFinite(bay.rig.x));
  }
});
test('all construction and logistics textures are available offline and included in bundle assets',async t=>{
  const server=createAppServer({getSnapshot:()=>({})});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  for(const file of CONSTRUCTION_ASSETS)assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/'+file)).status,200,file);
  for(const id of ['rail-gantry','dock-pier','dock-worker','bricklayer','material-trolley','forklift',...MATERIALS])assert.ok(LOGISTICS_FRAMES[id]);
});

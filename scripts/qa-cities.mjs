// Render the shipped UI with illustrative traffic, without starting collectors.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {demoSnapshot} from '../public/demo.js';
import {cityStage} from '../public/cities.js';
app.setPath('userData',resolve('test-results/city-preview-profile'));
app.whenReady().then(async()=>{
const errors=[];
let cityBoost=0;
let firefoxBoost=0;
let constructionBoost=0;
const snapshot=()=>{
  const s=demoSnapshot(),ips=['142.250.80.46','142.250.80.14','104.18.32.7','13.107.42.12','140.82.112.4'];
  s.connections=s.connections.filter(c=>ips.includes(c.remoteAddress));
  s.traffic.cityUsage.find(c=>c.app==='Code').receivedBytesTotal+=cityBoost;
  s.traffic.cityUsage.find(c=>c.app==='firefox').receivedBytesTotal+=firefoxBoost+constructionBoost;
  return {snapshot:s,interval:2000,collecting:false,error:null};
};
const server=createAppServer({getSnapshot:snapshot,getAnalytics:()=>({}),requestRestart:()=>({})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const window=new BrowserWindow({show:false,width:1440,height:1340,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
try {
  await window.loadURL(`http://127.0.0.1:${server.address().port}`);
  await new Promise(resolve=>setTimeout(resolve,1800));
  const inspect=()=>window.webContents.executeJavaScript(`(()=>{
    const cities=[...document.querySelectorAll('.application-city')];
    return {count:cities.length,stages:cities.map(c=>Number(c.dataset.stage)),helpers:document.querySelectorAll('.application-city .helper-person').length,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  const initial=await inspect();assert.equal(initial.count,3,JSON.stringify(errors));assert.deepEqual(initial.stages,[12,8,3]);assert.ok(initial.helpers>=9);
  const sortOrders=[
    ['app',['Firefox','OneDrive','Visual Studio Code']],
    ['downloadSpeed',['OneDrive','Visual Studio Code','Firefox']],
    ['uploadSpeed',['Visual Studio Code','Firefox','OneDrive']],
    ['download',['OneDrive','Visual Studio Code','Firefox']],
    ['upload',['Visual Studio Code','Firefox','OneDrive']],
    ['total',['Visual Studio Code','OneDrive','Firefox']]
  ];
  for(const [key,ascending] of sortOrders) {
    for(const [direction,expected] of [['ascending',ascending],['descending',[...ascending].reverse()]]) {
      const sorted=await window.webContents.executeJavaScript(`(()=>{
        const button=document.querySelector('[data-map-sort="${key}"]');button.click();
        return {direction:document.querySelector('[data-map-sort="${key}"]').parentElement.getAttribute('aria-sort'),names:[...document.querySelectorAll('.application-city-card .route-origin strong')].map(el=>el.textContent)};
      })()`);
      assert.equal(sorted.direction,direction);assert.deepEqual(sorted.names,expected);
    }
  }
  const compact=await window.webContents.executeJavaScript(`(()=>{
    const cards=[...document.querySelectorAll('.application-city-card')];
    return {heights:cards.map(c=>c.getBoundingClientRect().height),graphs:document.querySelectorAll('.usage-graph').length,
      identitySeparated:cards.every(c=>{const app=c.querySelector('.city-app-card'),detail=c.querySelector('.city-detail-card');return app.querySelector('.route-origin')&&app.querySelectorAll('.route-usage').length===3&&app.getBoundingClientRect().right<=detail.getBoundingClientRect().left;}),
      footerAligned:cards.every(c=>{const cells=[c.querySelector('.city-caption'),c.querySelector('.city-services')];const centers=cells.map(el=>{const b=el.getBoundingClientRect();return b.top+b.height/2});return Math.max(...centers)-Math.min(...centers)<2;}),
      pairedDetails:cards.every(c=>{const pairs=[[c.querySelector('.city-caption strong'),c.querySelector('.city-download-progress')],[c.querySelector('.city-services strong'),c.querySelector('.city-services small')]];return pairs.every(pair=>{const bounds=pair.map(el=>el.getBoundingClientRect());return Math.max(...bounds.map(b=>b.top))<Math.min(...bounds.map(b=>b.bottom));});})};
  })()`);
  assert.ok(compact.heights.every(h=>h<270),'living city cards stay below 270px: '+JSON.stringify(compact));assert.equal(compact.graphs,9);assert.equal(compact.identitySeparated,true);assert.equal(compact.footerAligned,true,JSON.stringify(compact));assert.equal(compact.pairedDetails,true,JSON.stringify(compact));
  const facing=await window.webContents.executeJavaScript(`(()=>{
    const person=document.querySelector('.crew-carrier>.helper-person'),animation=person.getAnimations()[0],saved=animation.currentTime;
    animation.currentTime=1200;const left=new DOMMatrix(getComputedStyle(person).transform).a;
    animation.currentTime=8000;const right=new DOMMatrix(getComputedStyle(person).transform).a;
    animation.currentTime=saved;return {left,right};
  })()`);
  assert.deepEqual(facing,{left:-1,right:1},'walker faces in the direction of travel');
  await window.webContents.executeJavaScript(`window.cityNode=document.querySelector('.application-city');window.convoyNode=document.querySelector('.convoy-svg');
    window.worldCloud=document.querySelector('.world-cloud');window.worldCloudAnimation=window.worldCloud.getAnimations()[0];window.workerAnimation=document.querySelector('.crew-carrier').getAnimations().find(a=>a.animationName==='city-carry');
    window.sceneRemovals=0;window.sceneObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node.nodeType===1&&(node.matches('.application-city,.convoy-svg')||node.querySelector('.application-city,.convoy-svg')))window.sceneRemovals++;});window.sceneObserver.observe(document.querySelector('#main'),{childList:true,subtree:true});`);
  const workerTime=()=>window.webContents.executeJavaScript(`document.querySelector('.crew-carrier').getAnimations().find(a=>a.animationName==='city-carry').currentTime`);
  const firstWorkerTime=await workerTime();
  await new Promise(resolve=>setTimeout(resolve,2400));
  const refreshedWorkerTime=await workerTime();
  assert.equal(await window.webContents.executeJavaScript(`window.worldCloud===document.querySelector('.world-cloud')&&window.worldCloudAnimation===window.worldCloud.getAnimations()[0]`),true,'polling retains cloud nodes and their animation timelines');
  assert.ok(refreshedWorkerTime>firstWorkerTime+2100,`worker playback must advance through a polling refresh: ${firstWorkerTime} → ${refreshedWorkerTime}`);
  assert.equal(await window.webContents.executeJavaScript(`window.cityNode===document.querySelector('.application-city')&&window.convoyNode===document.querySelector('.convoy-svg')`),true,'polling must preserve animation nodes');
  assert.equal(await window.webContents.executeJavaScript(`window.sceneRemovals===0&&window.workerAnimation===document.querySelector('.crew-carrier').getAnimations().find(a=>a.animationName==='city-carry')`),true,'refresh must keep scenes connected and preserve the CSS Animation object');
  await window.webContents.executeJavaScript(`window.buildCity=document.querySelector('[data-city-key="application|firefox"]');window.buildProject=window.buildCity.querySelector('.city-project');window.buildCrane=window.buildCity.querySelector('.crane-load');window.buildCraneAnimation=window.buildCrane.getAnimations()[0];window.buildVehicle=window.buildCity.querySelector('.site-vehicle');window.buildVehicleAnimation=window.buildVehicle.getAnimations()[0];window.buildProgress=window.buildProject.dataset.buildProgress;window.clipHeight=window.buildCity.querySelector('clipPath rect').getAttribute('height');window.buildStage=window.buildCity.dataset.stage;`);
  constructionBoost=20*1024**3;
  await new Promise(resolve=>setTimeout(resolve,2400));
  assert.equal(await window.webContents.executeJavaScript(`window.buildCity.dataset.stage===window.buildStage&&Number(window.buildProject.dataset.buildProgress)>Number(window.buildProgress)&&Number(window.buildCity.querySelector('clipPath rect').getAttribute('height'))>Number(window.clipHeight)`),true,'downloads within a level raise frames and reveal the next illustrated skyline');
  assert.equal(await window.webContents.executeJavaScript(`window.buildProject===window.buildCity.querySelector('.city-project')&&window.buildCrane===window.buildCity.querySelector('.crane-load')&&window.buildCraneAnimation===window.buildCrane.getAnimations()[0]&&window.buildVehicleAnimation===window.buildVehicle.getAnimations()[0]`),true,'construction updates retain cranes, machinery, projects and their animation objects');
  assert.equal(await window.webContents.executeJavaScript(`(()=>{
    document.querySelector('[data-map-sort="app"]').click();
    return window.workerAnimation===window.cityNode.querySelector('.crew-carrier').getAnimations().find(a=>a.animationName==='city-carry');
  })()`),true,'reordering application cards keeps CSS animation playback');
  assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('.application-child').length`),0,'services start collapsed');
  await window.webContents.executeJavaScript(`document.querySelector('[data-map-expand="firefox"]').click()`);
  const expanded=await window.webContents.executeJavaScript(`({children:document.querySelectorAll('.application-child').length,childCities:document.querySelectorAll('.application-child .application-city').length,sameCity:window.cityNode===document.querySelector('.application-city')})`);
  assert.equal(expanded.children,3);assert.equal(expanded.childCities,0);assert.equal(expanded.sameCity,true);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.city-info').textContent.includes('Info')&&document.querySelector('.city-info').textContent.includes('PID')`),true);
  assert.equal((await inspect()).count,3,'expanding services must not create cities');
  await window.webContents.executeJavaScript(`document.querySelector('[data-map-expand="firefox"]').click()`);
  assert.equal(await window.webContents.executeJavaScript(`window.cityNode===document.querySelector('.application-city')`),true,'collapsing services preserves the city');
  assert.ok(await workerTime()>firstWorkerTime+2100,'expanding/collapsing services must preserve worker playback');
  await window.webContents.executeJavaScript(`window.growingCity=document.querySelector('[data-city-key="application|vscode"]');window.growingWorker=window.growingCity.querySelector('.crew-carrier');window.growingHelper=window.growingCity.querySelector('.crew-walker');window.helperCount=window.growingCity.querySelectorAll('.helper-person').length;window.growthTime=window.growingWorker.getAnimations()[0].currentTime;`);
  cityBoost=1024**3;
  await new Promise(resolve=>setTimeout(resolve,2400));
  const growthStage=cityStage(1.12*1024**3).index;
  assert.equal(await window.webContents.executeJavaScript(`window.growingCity===document.querySelector('[data-city-key="application|vscode"]')&&window.growingWorker===window.growingCity.querySelector('.crew-carrier')&&window.growingCity.dataset.stage==='${growthStage}'&&window.growingWorker.getAnimations()[0].currentTime>window.growthTime+2100`),true,'growth preserves the worker and its animation time');
  assert.equal(await window.webContents.executeJavaScript(`window.growingCity.querySelectorAll('.helper-person').length>window.helperCount&&window.growingHelper===window.growingCity.querySelector('.crew-walker')`),true,'growth adds helpers and retains existing walkers');
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="settings"]').click()`);
  await new Promise(resolve=>setTimeout(resolve,300));
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="motion"]').click()`);
  const paused=await window.webContents.executeJavaScript(`(()=>{const a=document.querySelector('.crew-carrier').getAnimations()[0];return {paused:getComputedStyle(document.querySelector('.crew-carrier')).animationPlayState,at:a?.currentTime,progress:document.querySelector('.transport-vehicle')?.dataset.progress};})()`);
  assert.equal(paused.paused,'paused');
  assert.equal(await window.webContents.executeJavaScript(`[...document.querySelectorAll('.world-cloud,.world-birds')].every(el=>getComputedStyle(el).animationPlayState==='paused')`),true,'pause freezes living scenery');
  assert.equal(await window.webContents.executeJavaScript(`[...document.querySelectorAll('.crane-load,.site-vehicle')].every(el=>getComputedStyle(el).animationPlayState==='paused')`),true,'pause freezes every construction machine');
  await new Promise(resolve=>setTimeout(resolve,300));
  const frozen=await window.webContents.executeJavaScript(`({at:document.querySelector('.crew-carrier').getAnimations()[0]?.currentTime,progress:document.querySelector('.transport-vehicle')?.dataset.progress})`);
  assert.ok(Math.abs(frozen.at-paused.at)<40);assert.equal(frozen.progress,paused.progress);
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="motion"]').click()`);
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="close"]').click()`);
  await new Promise(resolve=>setTimeout(resolve,6200));
  assert.ok(await workerTime()>12000,'worker must complete a full carrying and return cycle across repeated polls');
  await mkdir(resolve('test-results/cities'),{recursive:true});
  await writeFile(resolve('test-results/cities/desktop.png'),(await window.webContents.capturePage()).toPNG());
  window.setSize(760,1160);await new Promise(resolve=>setTimeout(resolve,250));
  const narrow=await inspect();assert.equal(narrow.overflow,false);
  const sceneFits=await window.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.application-city-card'),bounds=card.getBoundingClientRect(),scene=card.querySelector('.city-route-scene').getBoundingClientRect();return scene.left>=bounds.left&&scene.right<=bounds.right;})()`);
  assert.equal(sceneFits,true,'combined city and road must fit on narrow screens');
  await writeFile(resolve('test-results/cities/narrow.png'),(await window.webContents.capturePage()).toPNG());
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.crew-carrier')).animationName`),'none');
  assert.equal(await window.webContents.executeJavaScript(`[...document.querySelectorAll('.crane-load,.site-vehicle')].every(el=>getComputedStyle(el).animationName==='none')`),true,'reduced motion disables construction animations');
  const reducedProgress=await window.webContents.executeJavaScript(`document.querySelector('.transport-vehicle')?.dataset.progress`);
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.transport-vehicle')?.dataset.progress`),reducedProgress);
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await window.webContents.executeJavaScript(`document.querySelector('[data-page="overview"]').click()`);
  assert.equal(await window.webContents.executeJavaScript(`[...document.querySelectorAll('.city-route-scene')].every(svg=>Number(svg.dataset.sceneEnd)>0)`),true,'reopening the current page measures and observes replacement scenes');
  window.setSize(1440,1340);
  cityBoost=16*1024**4;firefoxBoost=16*1024**4;
  for(const type of ['helicopter','mega-ship']) {
    await window.webContents.executeJavaScript(`(()=>{const s=document.querySelector('#map-vehicle');s.value='${type}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await new Promise(resolve=>setTimeout(resolve,2400));
    const live=await window.webContents.executeJavaScript(`(()=>{const c=document.querySelector('.application-city');const g=c.querySelector('[data-transport="${type}"]');return {stage:Number(c.dataset.stage),type:c.dataset.downloadType,journey:!!g,progress:Number(g?.dataset.progress),bounds:g?g.getBBox().width:0};})()`);
    assert.equal(live.stage,19);assert.equal(live.type,type);assert.equal(live.journey,true);assert.ok(live.progress>0);assert.ok(live.bounds>0);
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.application-city').querySelectorAll('.site-crane').length`),6,'giant cities have six cranes');
    await writeFile(resolve('test-results/cities/'+type+'.png'),(await window.webContents.capturePage()).toPNG());
  }
    const worldChecks=await window.webContents.executeJavaScript(`(async()=>{
    const {renderCity,CITY_STAGES}=await import('/cities.js');
    const {TransportAnimator}=await import('/map.js');
    const {updateWorldTime,WORLD_BACKGROUNDS}=await import('/world.js');
    const {updateMarkup}=await import('/render.js');
    const root=document.createElement('div');root.style.cssText='position:absolute;left:0;top:0;width:900px;height:180px';
    document.body.append(root);
    let date=new Date(2026,9,8,12);
    const animator=new TransportAnimator({wallClock:()=>date,requestFrame:()=>1,cancelFrame:()=>{}});
    let cloud=null,animation=null;
    for(let stage=0;stage<20;stage++) {
      updateMarkup(root,renderCity({key:'world-probe',bytes:CITY_STAGES[stage].at,convoy:'data-route-key="world-probe" data-download-rate="100000" data-upload-rate="20000" data-download-type="pickup" data-upload-type="cargo-bicycle"'}));
      root.querySelector('svg').style.height='180px';
      animator.mount(root,{source:'world-probe',active:false});
      const svg=root.querySelector('svg'),port=svg.querySelector('.world-port');
      if(svg.querySelector('.world-terrain').getAttribute('href')!==WORLD_BACKGROUNDS[stage].file)throw new Error('Wrong background at tier '+stage);
      if(port.getAttribute('opacity')!==(stage>=12?'1':'0'))throw new Error('Port at tier '+stage);
      if(svg.querySelector('.world-city').getBoundingClientRect().right<=svg.getBoundingClientRect().left+svg.getBoundingClientRect().width/2)throw new Error('City must be on the right');
      if(stage===0){cloud=svg.querySelector('.world-cloud');animation=cloud.getAnimations()[0];}
      if(svg.querySelector('.world-cloud')!==cloud||cloud.getAnimations()[0]!==animation)throw new Error('Growth restarted a cloud');
    }
    date=new Date(2026,9,8,21);animator.updateWorldClock();
    if(root.querySelector('svg').dataset.time!=='night')throw new Error('Clock must update while motion is paused');
    date=new Date(2026,9,8,6);animator.updateWorldClock();
    if(root.querySelector('svg').dataset.time!=='sunrise')throw new Error('Sunrise clock');
    animator.mount(document.createElement('div'),{source:'world-probe',active:false});
    if(animator.worldTimer!==null)throw new Error('Detached scene clock leaked');
    animator.resizeObserver?.disconnect();root.remove();
    return {growthStages:20,distinctBackgrounds:20,cloudContinuity:true,clockWhilePaused:true,clockCleanup:true};
  })()`);
  window.setSize(1440,1340);
  await window.webContents.executeJavaScript(`window.worldNoTransition=document.createElement('style');window.worldNoTransition.textContent='.application-city * {transition:none!important}';document.head.append(window.worldNoTransition);`);
  for(const [phase,hour] of [['sunrise',6],['day',12],['sunset',18],['night',21]]) {
    await window.webContents.executeJavaScript(`(async()=>{const {updateWorldTime}=await import('/world.js');for(const svg of document.querySelectorAll('.city-route-scene'))updateWorldTime(svg,new Date(2026,9,8,${hour}));})()`);
    await new Promise(resolve=>setTimeout(resolve,80));
    await writeFile(resolve('test-results/cities/'+phase+'.png'),(await window.webContents.capturePage()).toPNG());
  }
  await window.webContents.executeJavaScript(`window.worldNoTransition.remove();`);
  assert.deepEqual(errors,[]);
  await writeFile(resolve('test-results/cities/results.json'),JSON.stringify({initial,compact,narrow,worldChecks,persistentNodes:true,workerFullCycle:true,growthContinuity:true,pause:true,reducedMotion:true,topTierAirAndShips:true,errors},null,2));
  console.log('CITY_UI_VERIFIED '+JSON.stringify(initial));
} finally {await mkdir(resolve('test-results/cities'),{recursive:true});await writeFile(resolve('test-results/cities/latest.png'),(await window.webContents.capturePage()).toPNG());window.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

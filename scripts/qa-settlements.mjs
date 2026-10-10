// Real map rendering: check lighting, atlas growth and on-corridor readings.
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
app.setPath('userData',resolve('test-results/settlement-profile'));
app.whenReady().then(async()=>{
const output=resolve('test-results/settlements');await mkdir(output,{recursive:true});
const assets=createAppServer({getSnapshot:()=>({})});
const html=`<!doctype html><meta charset="utf-8"><title>Integrated city landscapes</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transport.css"><style>body{display:block;margin:0;padding:20px;background:#f4f5eb;font-family:Segoe UI;color:#294737;overflow:auto}h1{font-size:24px;margin:0 0 6px}p{margin:0 0 18px;font-size:13px}#gallery{max-width:1240px}.application-city *{transition:none!important}</style><h1>Every byte builds</h1><p>Illustrative traffic · Integrated landscapes and direction readings</p><div id="gallery"></div>`;
const server=createServer((req,res)=>{if(req.url==='/preview'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else assets.emit('request',req,res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const window=new BrowserWindow({show:false,width:1280,height:1180,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
// Offscreen Chromium can reject a capture while committing a resize/animation
// frame. Wait for its next frame and retry the same read-only screenshot.
const capture=async(rect)=>{
  for(let attempt=0;attempt<3;attempt++) {
    try{return (await window.webContents.capturePage(rect)).toPNG();}
    catch(error){if(!String(error).includes('UnknownVizError')||attempt===2)throw error;await new Promise(r=>setTimeout(r,100));}
  }
};
const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3){errors.push(event.message);console.error('RENDERER',event.message);}});
try {
  await window.loadURL('http://127.0.0.1:'+server.address().port+'/preview');
  const initial=await window.webContents.executeJavaScript(`(async()=>{
    const {renderNetworkMap,TransportAnimator}=await import('/map.js');
    const {CITY_STAGES}=await import('/cities.js');
    const {speedButton}=await import('/speed.js');
    const {worldRoute,transportScenery,updateWorldTime}=await import('/world.js');
    const {transportSpec}=await import('/vehicles.js');
    const {updateMarkup}=await import('/render.js');
    const gallery=document.querySelector('#gallery');
    const rates=[[32000,18000],[2.2*1024**2,28000],[70*1024**2,2.2*1024**2],[3*1024**2,40*1024**2]];
    const names=['firefox','Code','OneDrive','chrome'];
    const render=(stages=[3,9,14,19],progress=0)=>{
      const connections=stages.map((stage,i)=>({app:names[i],pid:10+i,scope:'Internet',protocol:'TCP',state:'Established',remoteAddress:'1.2.3.'+(i+1),remotePort:443,receiveRate:rates[i][0],sendRate:rates[i][1],receivedBytes60m:12345678,sentBytes60m:654321}));
      const state={snapshot:{connections,traffic:{available:true,cityUsage:connections.map((c,i)=>({...c,receivedBytesTotal:CITY_STAGES[stages[i]].at+(CITY_STAGES[stages[i]+1]?.at-CITY_STAGES[stages[i]].at||0)*progress,sentBytesTotal:0}))}},mode:'live',mapApp:'all',mapQuery:'',mapDetail:'service',mapLimit:20,mapSort:'app',mapSortDirection:'asc',mapVehicle:'auto',motion:true,mapExpanded:new Set()};
      updateMarkup(gallery,renderNetworkMap({state,icon:()=>'',rate:n=>speedButton(n,'Mbit/s'),bytes:n=>n==null?'—':(n/1024**2).toFixed(1)+' MB',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}));
      animator.mount(gallery,{source:'preview',active:true});
    };
    let now=0;const animator=new TransportAnimator({clock:()=>now,requestFrame:()=>1,cancelFrame:()=>{},wallClock:()=>new Date(2026,9,9,21)});
    render();now=3000;animator.tick();animator.draw();
    window.settlementQA={render,animator,updateWorldTime,worldRoute,transportSpec};
    const assets=new Set([...gallery.querySelectorAll('image')].map(n=>n.getAttribute('href')));
    await Promise.all([...assets].map(src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=()=>reject(new Error(src));im.src=src;})));
    window.residentNode=gallery.querySelector('.resident-walk');window.residentAnimation=window.residentNode.getAnimations()[0];
    window.residentTime=window.residentAnimation.currentTime;
    const stride=gallery.querySelector('.resident-stride'),animation=stride.getAnimations()[0];
    const saved=animation.currentTime;animation.currentTime=0;const first=getComputedStyle(stride).transform;animation.currentTime=420;const next=getComputedStyle(stride).transform;animation.currentTime=saved;
    if(first===next)throw new Error('Pedestrian walk poses must actually change');
    return {walkPosesChange:true,cards:gallery.querySelectorAll('.application-city-card').length,assetsLoaded:assets.size};
  })()`);
  const inspect=()=>window.webContents.executeJavaScript(`(()=>{
    const problems=[];
    for(const svg of document.querySelectorAll('.application-city')) {
      const parent=svg.parentElement,ctm=svg.getScreenCTM();
      const labels=['download','upload'].map(direction=>{
        const mode=window.settlementQA.transportSpec(svg.dataset[direction+'Type']).mode;
        const baseline=window.settlementQA.worldRoute(direction,mode)[0].y;
        const reading=parent.querySelector('.route-speeds .'+direction+'-rate');
        const b=reading.getBoundingClientRect(),button=reading.querySelector('.speed-value');
        const actual=ctm.d*baseline+ctm.f;
        if(Math.abs(b.top+b.height/2-actual)>1.5)problems.push('Baseline mismatch: '+direction);
        if(Number(getComputedStyle(button).fontWeight)<800)problems.push('Number not bold');
        if(getComputedStyle(button).fontStyle!=='italic')problems.push('Number not italic');
        if(!/^([0-9]+\.[0-9]|—) Mbit[/]s$/.test(button.textContent.trim()))problems.push('Not a plain one-decimal Mbit/s reading');
        if(reading.querySelector(':scope > small')?.textContent!==(direction==='download'?'Down':'Up'))problems.push('Incorrect direction caption');
        if(getComputedStyle(reading).borderTopWidth!=='0px'||getComputedStyle(reading).backgroundColor!=='rgba(0, 0, 0, 0)')problems.push('Label still has badge styling');
        if(Math.abs(b.left-parent.getBoundingClientRect().left-12)>1)problems.push('Reading not on the left');
        const scene=parent.getBoundingClientRect();
        if(b.left<scene.left||b.right>scene.right)problems.push('Label outside scene');
        return b;
      });
      if(labels[0].left<labels[1].right&&labels[1].left<labels[0].right&&labels[0].top<labels[1].bottom&&labels[1].top<labels[0].bottom)problems.push('Overlapping labels');
      const sceneBounds=svg.getBoundingClientRect();
      const residents=[...svg.querySelectorAll('.resident-home')];
      if(residents.length<4)problems.push('Missing visible residents');
      const residentX=residents.map(node=>node.getScreenCTM().e);
      if(Math.max(...residentX)-Math.min(...residentX)<sceneBounds.width*.6)problems.push('Street life remains clustered');
      if(svg.querySelectorAll('.site-crane').length>1) {
        const craneX=[...svg.querySelectorAll('.site-crane')].map(node=>node.getScreenCTM().e);
        if(Math.max(...craneX)-Math.min(...craneX)<sceneBounds.width*.5)problems.push('Construction remains clustered');
      }
      if(svg.querySelector('.world-city .city-buildings').getBoundingClientRect().width<svg.getBoundingClientRect().width*.7)problems.push('Settlement too small');
      for(const selector of ['.world-terrain','.world-city','.world-infrastructure','.world-decoration'])if(svg.querySelector(selector).closest('.world-landscape')!==svg.querySelector('.world-landscape'))problems.push('Layer outside shared lighting');
    }
    return {problems,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  const layouts=[];
  for(const [viewport,width,name] of [[1280,'','desktop'],[760,'510px','narrow'],[760,'420px','compact'],[390,'','phone']]) {
    window.setSize(viewport,1180);
    await window.webContents.executeJavaScript(`document.querySelector('#gallery').style.width='${width}';`);
    await new Promise(r=>setTimeout(r,300));
    const result=await inspect();assert.deepEqual(result.problems,[],name+': '+JSON.stringify(result));assert.equal(result.overflow,false);
    layouts.push({name,...result});
    await writeFile(resolve(output,name+'-night.png'),await capture());
  }
  window.setSize(1280,1180);
  for(const [phase,hour] of [['sunrise',6],['day',12],['sunset',18],['night',21]]) {
    const lighting=await window.webContents.executeJavaScript(`(()=>{for(const svg of document.querySelectorAll('.application-city'))window.settlementQA.updateWorldTime(svg,new Date(2026,9,9,${hour}));return [...document.querySelectorAll('${phase==='night'?'.world-terrain':'.world-landscape'}')].map(n=>getComputedStyle(n).filter);})()`);
    if(phase!=='day')assert.ok(lighting.every(value=>value.includes('brightness')));
    await new Promise(r=>setTimeout(r,100));await writeFile(resolve(output,phase+'.png'),await capture());
  }
  const motion=await window.webContents.executeJavaScript(`(()=>{
    if(window.residentNode!==document.querySelector('.resident-walk'))throw new Error('Resize replaced residents');
    if(window.residentAnimation!==window.residentNode.getAnimations()[0])throw new Error('Resize restarted resident animation');
    if(window.residentAnimation.currentTime<=window.residentTime+300)throw new Error('Resident timeline is not advancing');
    window.settlementQA.render([9,9,9,9],.2);
    const svg=document.querySelector('.application-city'),resident=svg.querySelector('.resident-walk'),animation=resident.getAnimations()[0],crane=svg.querySelector('.crane-load');
    svg.classList.remove('city-working');svg.classList.add('city-resting');
    if(getComputedStyle(crane).animationPlayState!=='paused')throw new Error('Idle construction is not paused');
    if(getComputedStyle(resident).animationPlayState!=='running')throw new Error('Idle city lost its ambient street life');
    svg.classList.remove('city-resting');svg.classList.add('city-working');
    const project=svg.querySelector('.city-project'),projectProgress=Number(project.dataset.buildProgress),clip=svg.querySelector('.city-buildings clipPath rect'),clipHeight=Number(clip.getAttribute('height'));
    window.settlementQA.render([9,9,9,9],.65);
    if(project!==svg.querySelector('.city-project')||resident!==svg.querySelector('.resident-walk')||animation!==resident.getAnimations()[0])throw new Error('Construction progress replaced live actors');
    if(Number(project.dataset.buildProgress)<=projectProgress||Number(clip.getAttribute('height'))<=clipHeight)throw new Error('Measured bytes did not build the city');
    const unchangedProgress=Number(project.dataset.buildProgress);
    window.settlementQA.render([9,9,9,9],.65);
    if(unchangedProgress!==Number(svg.querySelector('.city-project').dataset.buildProgress))throw new Error('Polling manufactured construction');
    const table=svg.closest('.transport-table');table.classList.add('still');
    if([...svg.querySelectorAll('.resident-walk,.resident-facing,.resident-stride,.site-vehicle,.crane-load')].some(n=>getComputedStyle(n).animationPlayState!=='paused'))throw new Error('Pause did not freeze all activity');
    table.classList.remove('still');
    return {timelinesAdvance:true,nodesRetained:true,walkPosesChange:true,idleResidentsActive:true,idleConstructionPaused:true,pauseFreezesAll:true,measuredConstructionAdvances:true,growthPreservesActors:true};
  })()`);
  // Follow one real rendered pickup through pull-in, drop-off and departure.
  const delivery=[];
  await window.webContents.executeJavaScript(`(()=>{
    const animator=window.settlementQA.animator;
    for(const lane of animator.queue.lanes.values()){lane.vehicles=[];lane.count=0;lane.nextDeparture=null;}
    const svg=[...document.querySelectorAll('.application-city')].find(svg=>window.settlementQA.transportSpec(svg.dataset.downloadType).mode==='road');
    const lane=animator.queue.lanes.get(svg.dataset.routeKey+'|download');
    const journey={id:100000,type:'pickup',incoming:true,started:animator.queue.now,arrives:animator.queue.now+12000};
    lane.vehicles=[journey];window.deliveryProbe={svg,journey};
    animator.draw();
  })()`);
  for(const [name,progress] of [['pull-in',.56],['arrive',.62],['unload',.70],['delivered',.78],['depart',.90],['fade',.98]]) {
    const frame=await window.webContents.executeJavaScript(`(()=>{
      const {svg,journey}=window.deliveryProbe,animator=window.settlementQA.animator;
      animator.queue.now=journey.started+12000*${progress};animator.draw();
      const node=svg.querySelector('[data-journey-id="100000"]'),parcel=node.querySelector('.delivery-parcel'),bounds=svg.getBoundingClientRect();
      const cargo=node.querySelector('.vehicle-cargo'),position=node.transform.baseVal.consolidate().matrix;
      return {x:position.e,y:position.f,opacity:Number(node.style.opacity),cargoOpacity:Number(cargo.style.opacity),parcelX:parcel.getScreenCTM().e,
        rect:{x:Math.ceil(bounds.x),y:Math.ceil(bounds.y),width:Math.floor(bounds.width),height:Math.floor(bounds.height)}};
    })()`);
    delivery.push({name,...frame});
    await new Promise(r=>setTimeout(r,80));await writeFile(resolve(output,'delivery-'+name+'.png'),await capture(frame.rect));
  }
  assert.ok(delivery[0].x<delivery[1].x,'vehicle visibly approaches the city');
  assert.equal(delivery[1].x,delivery[3].x,'vehicle holds at the dock while unloading');
  assert.ok(delivery[2].cargoOpacity<delivery[1].cargoOpacity,'goods leave the vehicle');
  assert.equal(delivery[3].cargoOpacity,0,'departure is empty');
  assert.ok(delivery[4].x>delivery[3].x,'empty vehicle continues right');
  assert.ok(delivery[5].opacity<delivery[4].opacity,'vehicle fades as it drives out');
  assert.ok(Math.abs(delivery[4].parcelX-delivery[3].parcelX)<1,'goods remain at the city dock');
  for(const [name,progress] of [['early',.2],['late',.65]]) {
    await window.webContents.executeJavaScript(`(()=>{window.settlementQA.render([9,9,9,9],${progress});for(const svg of document.querySelectorAll('.application-city'))window.settlementQA.updateWorldTime(svg,new Date(2026,9,9,12));})()`);
    await new Promise(r=>setTimeout(r,200));await writeFile(resolve(output,'construction-'+name+'.png'),await capture());
  }
  const growth=await window.webContents.executeJavaScript(`(()=>{const cells=new Set();for(let stage=0;stage<20;stage++){window.settlementQA.render([stage,stage,stage,stage]);const svg=document.querySelector('.application-city');cells.add(svg.querySelector('.city-established .settlement-illustration').getAttribute('viewBox')+'|'+svg.querySelector('.city-established image').getAttribute('href'));}return {stages:cells.size};})()`);
  assert.equal(growth.stages,20);assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'results.json'),JSON.stringify({initial,layouts,motion,delivery,growth,phases:4,errors},null,2));
  console.log('SETTLEMENTS_VERIFIED '+JSON.stringify({initial,layouts,motion,delivery,growth,phases:4,errors}));
}finally{await window.webContents.executeJavaScript(`window.settlementQA?.animator.mount(document.createElement('div'),{source:'done',active:false});window.settlementQA?.animator.resizeObserver?.disconnect();`).catch(()=>{});window.destroy();await new Promise(r=>server.close(r));app.quit();}

}).catch(error=>{console.error(error);app.exit(1);});

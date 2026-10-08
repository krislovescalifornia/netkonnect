// Exercise repeated live refreshes with ten large, busy application cities.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {demoSnapshot} from '../public/demo.js';

const output=resolve('test-results/animation');
const growing=process.argv.includes('--growing');
app.setPath('userData',resolve('test-results/animation-profile'));
app.whenReady().then(async()=>{
  const errors=[];
  let sample=0;
  const snapshot=()=>{
    sample++;
    const s=demoSnapshot(),connection=s.connections.find(c=>c.scope==='Internet'&&c.pid!==0);
    s.connections=Array.from({length:10},(_,i)=>({...connection,id:`animation-${i}`,app:`animation-${i}`,pid:100+i,receiveRate:3*1024**2,sendRate:1024**2}));
    s.traffic.cityUsage=s.connections.map(c=>({app:c.app,receivedBytesTotal:growing?512*1024**3+sample*2*1024**3:1024**4}));
    s.traffic.usageConnections=[];
    return {snapshot:s,interval:2000,collecting:false,error:null};
  };
  const server=createAppServer({getSnapshot:snapshot,getAnalytics:()=>({}),requestRestart:()=>({})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const window=new BrowserWindow({show:false,width:1440,height:1340,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}`);
    await new Promise(resolve=>setTimeout(resolve,1500));
    const continuity=await window.webContents.executeJavaScript(`(async()=>{
      const {TransportAnimator}=await import('/map.js');
      const {renderCity,CITY_STAGES}=await import('/cities.js');
      const {updateMarkup}=await import('/render.js');
      // Direct growth updates must agree with a fresh render in every tier.
      const growthRoot=document.createElement('div');
      for(let stage=0;stage<CITY_STAGES.length;stage++) {
        const bytes=progress=>CITY_STAGES[stage].at+(CITY_STAGES[stage+1]?.at-CITY_STAGES[stage].at||0)*progress;
        growthRoot.innerHTML=renderCity({key:'growth-probe',bytes:bytes(0)});
        for(const progress of [.1,.3,.6,.9]) {
          updateMarkup(growthRoot,renderCity({key:'growth-probe',bytes:bytes(progress),includeArtwork:false}));
          const expected=document.createElement('div');expected.innerHTML=renderCity({key:'growth-probe',bytes:bytes(progress)});
          for(const layer of ['.city-buildings','.city-projects']) {
            if(growthRoot.querySelector(layer).outerHTML!==expected.querySelector(layer).outerHTML)throw new Error('Growth mismatch at tier '+stage+', progress '+progress+', layer '+layer);
          }
        }
      }
      const svg=document.querySelector('.application-city').cloneNode(true);
      svg.querySelectorAll('.transport-vehicle').forEach(n=>n.remove());
      const root=document.createElement('div');root.append(svg);
      svg.classList.add('city-delivering');
      updateMarkup(root,svg.outerHTML.replace(' city-delivering',''));
      if(!svg.classList.contains('city-delivering'))throw new Error('Refresh reset live delivery state');
      let now=0,scheduled=0,cancelled=0;
      const animator=new TransportAnimator({clock:()=>now,requestFrame:()=>++scheduled,cancelFrame:()=>cancelled++});
      animator.mount(root,{source:'probe',active:true});
      now=1000;animator.tick();animator.draw();
      const vehicle=svg.querySelector('.transport-vehicle'),before=vehicle.getAttribute('transform');
      svg.dataset.sceneEnd=Number(svg.dataset.sceneEnd)+120;
      animator.mount(root,{source:'probe',active:true});
      const result={samePosition:vehicle.getAttribute('transform')===before,scheduled,cancelled,growthTiers:CITY_STAGES.length};
      animator.mount(root,{source:'probe',active:false});animator.resizeObserver?.disconnect();
      return result;
    })()`);
    assert.equal(continuity.samePosition,true,'changing speed-label width must not reposition vehicles already travelling');
    assert.equal(continuity.scheduled,1,'live refreshes must keep the pending animation frame');
    assert.equal(continuity.cancelled,0,'live refreshes must not cancel the animation loop');
    await window.webContents.executeJavaScript(`(()=>{
      const scenes=[...document.querySelectorAll('.application-city')];
      if(scenes.length!==10)throw new Error('Expected ten stress cities');
      window.animationProbe={scenes,animation:scenes[0].querySelector('.crew-carrier').getAnimations()[0],removals:0,styleReads:0,animationReads:0,gaps:[],longTasks:[]};
      const p=window.animationProbe;
      new MutationObserver(records=>{for(const r of records)for(const n of r.removedNodes)if(n.nodeType===1&&(n.matches('.convoy-svg')||n.querySelector('.convoy-svg')))p.removals++;}).observe(document.querySelector('#main'),{childList:true,subtree:true});
      p.getAnimations=Element.prototype.getAnimations;p.getBounds=Element.prototype.getBoundingClientRect;
      Element.prototype.getAnimations=function(...args){p.animationReads++;return p.getAnimations.apply(this,args);};
      Element.prototype.getBoundingClientRect=function(...args){p.styleReads++;return p.getBounds.apply(this,args);};
      new PerformanceObserver(list=>p.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false});
      let last=performance.now();function frame(now){p.gaps.push(now-last);last=now;p.frame=requestAnimationFrame(frame);}p.frame=requestAnimationFrame(frame);
    })()`);
    await new Promise(resolve=>setTimeout(resolve,10500));
    const report=await window.webContents.executeJavaScript(`(()=>{
      const p=window.animationProbe;cancelAnimationFrame(p.frame);
      Element.prototype.getAnimations=p.getAnimations;Element.prototype.getBoundingClientRect=p.getBounds;
      const gaps=p.gaps.slice(1).sort((a,b)=>a-b);
      return {cities:p.scenes.length,vehicles:document.querySelectorAll('.transport-vehicle').length,sceneRemovals:p.removals,animationReads:p.animationReads,layoutReads:p.styleReads,
        sameAnimation:p.animation===p.scenes[0].querySelector('.crew-carrier').getAnimations()[0],
        medianFrameMs:gaps[Math.floor(gaps.length*.5)],p95FrameMs:gaps[Math.floor(gaps.length*.95)],maxFrameMs:gaps.at(-1),longTasks:p.longTasks};
    })()`);
    assert.equal(report.sceneRemovals,0);assert.equal(report.sameAnimation,true);
    assert.equal(report.animationReads,0);assert.equal(report.layoutReads,0);
    assert.ok(report.vehicles>10);assert.deepEqual(errors,[]);
    await mkdir(output,{recursive:true});
    await writeFile(resolve(output,growing?'growing-results.json':'results.json'),JSON.stringify({...report,continuity,errors},null,2));
    console.log('ANIMATION_UI_VERIFIED '+JSON.stringify(report));
  } finally { window.destroy();await new Promise(resolve=>server.close(resolve));app.quit(); }
}).catch(error=>{console.error(error);app.exit(1);});

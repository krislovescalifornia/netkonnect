// Exercise repeated live refreshes with ten large, busy application cities.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {demoSnapshot} from '../public/demo.js';

const output=resolve('test-results/animation');
app.setPath('userData',resolve('test-results/animation-profile'));
app.whenReady().then(async()=>{
  const errors=[];
  const snapshot=()=>{
    const s=demoSnapshot(),connection=s.connections.find(c=>c.scope==='Internet'&&c.pid!==0);
    s.connections=Array.from({length:10},(_,i)=>({...connection,id:`animation-${i}`,app:`animation-${i}`,pid:100+i,receiveRate:3*1024**2,sendRate:1024**2}));
    s.traffic.cityUsage=s.connections.map(c=>({app:c.app,receivedBytesTotal:1024**4}));
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
    await writeFile(resolve(output,'results.json'),JSON.stringify({...report,errors},null,2));
    console.log('ANIMATION_UI_VERIFIED '+JSON.stringify(report));
  } finally { window.destroy();await new Promise(resolve=>server.close(resolve));app.quit(); }
}).catch(error=>{console.error(error);app.exit(1);});

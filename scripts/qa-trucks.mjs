// Native visual review at illustration scale and at actual lane sizes.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {VEHICLE_STAGES,vehicle} from '../public/vehicles.js';
const output=resolve('test-results/illustrated-trucks');
app.setPath('userData',resolve('test-results/illustrated-trucks-profile'));
const stages=VEHICLE_STAGES.slice(5,12);
const html=`<!doctype html><meta charset="utf-8"><title>Illustrated road fleet</title><style>
*{box-sizing:border-box}body{background:#fafbfc;color:#183449;font:14px Segoe UI;padding:30px;margin:0}h1{font:34px Georgia;margin:0 0 8px}p{color:#6f8190;margin:0 0 24px}.row{display:grid;grid-template-columns:150px repeat(3,1fr);align-items:center;margin-bottom:10px;background:white;padding:14px 20px;border:1px solid #e3e8ec;border-radius:10px}.row>div{text-align:center}.row .large{width:100%;height:130px;display:block}.lane{width:190px;height:52px}.row b{font-size:13px}.row small{display:block;color:#8493a0;font-size:10px;font-weight:400;margin-top:8px}.road{stroke:#e6ebef;stroke-width:1}#unload{display:flex;gap:25px;background:#fff;padding:15px;align-items:center}#unload>svg{width:190px;height:120px}#probe{position:absolute;opacity:0;pointer-events:none}
</style><h1>Illustrated road fleet</h1><p>True side profiles · level travel baselines · three paint variations per vehicle</p>${stages.map(s=>`<div class="row"><b>${s.name}<small>Illustration + actual lane size</small></b>${Array.from({length:3},(_,i)=>`<div><svg class="large" viewBox="-45 -35 90 55">${vehicle(s.id,false,i)}</svg><svg class="lane" viewBox="0 0 190 72"><path class="road" d="M0 29H190M0 61H190"/><g transform="translate(50 19) scale(-${Math.min(.85,53/s.width)} ${Math.min(.85,53/s.width)})">${vehicle(s.id,true,i)}</g><g transform="translate(140 51) scale(${Math.min(.85,53/s.width)})">${vehicle(s.id,false,i)}</g></svg></div>`).join('')}</div>`).join('')}<p>Delivery: loaded pickup → empty pickup · loaded lorry → empty lorry</p><div id="unload">${['pickup','rigid-truck'].flatMap(id=>[false,true].map(empty=>`<svg viewBox="-40 -30 80 50">${vehicle(id,false,0).replace('<g class="vehicle-cargo">',`<g class="vehicle-cargo" opacity="${empty?0:1}">`)}</svg>`)).join('')}</div><div id="probe"></div>`;

app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const assets=createAppServer({getSnapshot:()=>({})});
  const server=createServer((req,res)=>{
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
    else assets.emit('request',req,res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const win=new BrowserWindow({show:false,width:1240,height:1800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level===3)errors.push(e.message);});
  try{
    await win.loadURL(`http://127.0.0.1:${server.address().port}`);
    const report=await win.webContents.executeJavaScript(`(async()=>{
      const {TransportAnimator}=await import('/map.js');
      const {TRUCK_ASSETS}=await import('/truck-art.js');
      let transparentImages=0;
      for(const name of TRUCK_ASSETS){
        const image=new Image();image.src='/'+name;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data;
        let clear=0,paint=0;for(let i=3;i<rgba.length;i+=4){if(rgba[i]===0)clear++;if(rgba[i]>240)paint++;}
        if(clear>image.width*image.height*.25&&paint>10000)transparentImages++;
      }
      const root=document.querySelector('#probe');
      root.innerHTML='<svg width="900" height="215" class="convoy-svg city-route-scene" data-route-key="variety" data-download-rate="2000000" data-upload-rate="2000000" data-download-type="pickup" data-upload-type="pickup"><g class="city-supply-road"><path class="incoming-road"/><path class="outgoing-road"/></g><path class="road-divider"/><path class="lane-arrow incoming-road"/><path class="lane-arrow outgoing-road"/></svg>';
      const svg=root.firstElementChild;svg.dataset.sceneEnd='900';
      let now=0;const animator=new TransportAnimator({clock:()=>now,requestFrame:()=>1,cancelFrame:()=>{}});
      animator.mount(root,{source:'test',active:true});
      const first=root.querySelector('.transport-vehicle'),markup=first.innerHTML;
      for(let n=0;n<40;n++){now+=100;animator.tick();animator.draw();}
      animator.mount(root,{source:'test',active:true});
      const stable=first===root.querySelector('.transport-vehicle')&&markup===first.innerHTML;
      const original=[...root.querySelectorAll('.transport-vehicle')];
      const fleetVariety=new Set(original.map(n=>n.querySelector('.supply-pickup').innerHTML)).size;
      for(let n=0;n<72;n++){now+=100;animator.tick();animator.draw();}
      const unloaded=first.querySelector('.vehicle-cargo').style.opacity==='0';
      const emptyBed=!!first.querySelector('image[data-art-source="artwork/trucks/pickup-empty.png"]');
      const bodyVisible=Number(first.style.opacity)>0;
      animator.active=false;animator.resizeObserver?.disconnect();root.remove();
      return {stable,fleetVariety,fleetSize:original.length,transparentImages,assets:TRUCK_ASSETS.length,unloaded,emptyBed,bodyVisible,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(report.stable,true);assert.equal(report.fleetVariety,3);assert.equal(report.transparentImages,report.assets);assert.equal(report.unloaded,true);assert.equal(report.emptyBed,true);assert.equal(report.bodyVisible,true);assert.equal(report.overflow,false);assert.deepEqual(errors,[]);
    await writeFile(resolve(output,'catalog.html'),html);
    await new Promise(r=>setTimeout(r,500));
    win.webContents.debugger.attach('1.3');
    const metrics=await win.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const capture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(output,'preview.png'),Buffer.from(capture.data,'base64'));
    await writeFile(resolve(output,'results.json'),JSON.stringify({...report,errors},null,2));
    console.log('ILLUSTRATED_TRUCKS_VERIFIED '+JSON.stringify(report));
  }finally{win.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});

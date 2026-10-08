// Visual review of the 20 full panoramas and their live city-card integration.
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
app.setPath('userData',resolve('test-results/world-background-profile'));
app.whenReady().then(async()=>{
  const output=resolve('test-results/world-backgrounds'),errors=[];
  await mkdir(output,{recursive:true});
  const assets=createAppServer({getSnapshot:()=>({})});
  const html=`<!doctype html><meta charset="utf-8"><title>netKonnect — Twenty evolving worlds</title>
    <link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transport.css">
    <style>html{background:#f2f4e9}body{display:block;margin:0;padding:24px;font-family:Segoe UI,sans-serif;color:#294737;overflow:auto}*{box-sizing:border-box}
    h1{font-size:26px;margin:0 0 6px}p{font-size:13px;color:#65795f;margin:0 0 20px}
    #gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    figure{margin:0;border:1px solid #cbd7bf;border-radius:10px;overflow:hidden;background:#fffdf6}
    figcaption{font-size:14px;font-weight:600;padding:9px 12px}figure img{display:block;width:100%;height:auto}
    .preview-cards{display:grid;gap:16px}.application-city-card{margin:0!important}.preview-app{font-size:18px;font-weight:600}
    .application-city *{transition:none!important}
    </style><h1>The world as it grows</h1><p>Twenty individually painted watercolor backgrounds · Level 1 through Level 20</p><div id="gallery"></div>`;
  const server=createServer((req,res)=>{
    if(req.url==='/world-preview'){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; object-src 'none'"});res.end(html);}
    else assets.emit('request',req,res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1440,height:3000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try {
    await window.loadURL('http://127.0.0.1:'+server.address().port+'/world-preview');
    const gallery=await window.webContents.executeJavaScript(`(async()=>{
      const {WORLD_BACKGROUNDS}=await import('/world.js');
      document.querySelector('#gallery').innerHTML=WORLD_BACKGROUNDS.map(b=>'<figure><figcaption>Level '+b.level+' · '+b.name+'</figcaption><img alt="'+b.name+' background" src="/'+b.file+'"></figure>').join('');
      await Promise.all([...document.images].map(img=>img.decode()));
      return {count:document.images.length,loaded:[...document.images].every(img=>img.naturalWidth>=2000),overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(gallery.count,20);assert.equal(gallery.loaded,true);assert.equal(gallery.overflow,false);
    window.webContents.debugger.attach('1.3');
    const metrics=await window.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const fullPage=await window.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(output,'all-20-backgrounds.png'),Buffer.from(fullPage.data,'base64'));
    window.webContents.debugger.detach();
    window.setSize(1440,1050);
    const checks=await window.webContents.executeJavaScript(`(async()=>{
      const {renderCity,CITY_STAGES}=await import('/cities.js');
      const {WORLD_BACKGROUNDS}=await import('/world.js');
      const {TransportAnimator}=await import('/map.js');
      const {updateMarkup}=await import('/render.js');
      const gallery=document.querySelector('#gallery');gallery.className='transport-table preview-cards';gallery.style.gridTemplateColumns='1fr';
      const card=(stage,key='stage-'+stage)=>'<article class="transport-route application-city-card"><div class="city-app-card"><span class="preview-app">Level '+(stage+1)+'</span><span>'+CITY_STAGES[stage].name+'</span><small>Every byte builds</small></div><div class="city-detail-card"><div class="route-road">'+renderCity({key,bytes:CITY_STAGES[stage].at,date:new Date(2026,9,8,12),convoy:'data-route-key="'+key+'" data-download-rate="400000" data-upload-rate="20000" data-download-type="pickup" data-upload-type="cargo-bicycle"'})+'</div><div class="city-world-meta"><span>'+CITY_STAGES[stage].name+' landscape</span><span class="city-world-clock"></span></div></div></article>';
      gallery.innerHTML=[1,14,19].map(stage=>card(stage)).join('');
      const animator=new TransportAnimator({wallClock:()=>new Date(2026,9,8,12)});
      animator.mount(gallery,{source:'world-preview',active:true});window.worldPreviewAnimator=animator;
      const probe=document.createElement('div');probe.style.cssText='position:absolute;left:0;top:0;width:900px';document.body.append(probe);
      let terrain=null,city=null;
      for(let stage=0;stage<20;stage++) {
        updateMarkup(probe,card(stage,'growth-probe'));animator.mount(probe,{source:'growth',active:false});
        const svg=probe.querySelector('.application-city'),image=svg.querySelector('.world-terrain');
        if(stage===0){terrain=image;city=svg;}
        if(image!==terrain||svg!==city)throw new Error('Background change replaced the scene');
        if(image.getAttribute('href')!==WORLD_BACKGROUNDS[stage].file)throw new Error('Wrong background at level '+(stage+1));
      }
      animator.mount(gallery,{source:'world-preview',active:true});probe.remove();
      const backgrounds=[...gallery.querySelectorAll('.world-terrain')].map(img=>img.getAttribute('href'));
      if(new Set(backgrounds).size!==3)throw new Error('Comparison backgrounds must differ');
      await Promise.all([...document.querySelectorAll('svg image')].map(node=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=node.getAttribute('href');})));
      return {growthStages:20,terrainNodeRetained:true,sceneRetained:true,comparisonLevels:[2,15,20],backgrounds};
    })()`);
    await new Promise(r=>setTimeout(r,2300));
    await writeFile(resolve(output,'levels-02-15-20.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`window.worldPreviewAnimator.mount(document.createElement('div'),{source:'done',active:false});window.worldPreviewAnimator.resizeObserver?.disconnect();`);
    assert.deepEqual(errors,[]);
    await writeFile(resolve(output,'results.json'),JSON.stringify({gallery,checks,errors},null,2));
    console.log('WORLD_BACKGROUNDS_VERIFIED '+JSON.stringify({gallery,checks,errors}));
  } finally {window.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

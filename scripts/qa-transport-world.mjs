// Review evolving road materials and mixed transport in the actual SVG renderer.
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
app.setPath('userData',resolve('test-results/transport-world-profile'));
app.whenReady().then(async()=>{
  const output=resolve('test-results/transport-world'),errors=[];
  await mkdir(output,{recursive:true});
  const assets=createAppServer({getSnapshot:()=>({})});
  const html=`<!doctype html><meta charset="utf-8"><title>netKonnect — Evolving routes</title>
    <link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transport.css">
    <style>body{display:block;padding:24px;margin:0;background:#f4f5eb;color:#294737;font-family:Segoe UI,sans-serif;overflow:auto}
    h1{font-size:26px;margin:0 0 6px}p{margin:0 0 20px;font-size:13px}
    #gallery{display:grid;gap:12px}figure{margin:0;background:#fffdf6;border:1px solid #cbd7bf;border-radius:10px;overflow:hidden}
    figcaption{padding:9px 12px;font-size:14px;font-weight:600}.application-city{display:block;width:100%;height:210px;max-height:none}
    .application-city *{transition:none!important}.city-world-clock{display:none}</style>
    <h1>Routes that grow with the city</h1><p>Six painted road stages · Rail, waterways, airports and spaceports · Illustrative traffic</p><div id="gallery"></div>`;
  const server=createServer((req,res)=>{if(req.url==='/transport-preview'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else assets.emit('request',req,res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1280,height:2100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
  window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try {
    await window.loadURL('http://127.0.0.1:'+server.address().port+'/transport-preview');
    const checks=await window.webContents.executeJavaScript(`(async()=>{
      const {renderCity,CITY_STAGES}=await import('/cities.js');
      const {TransportAnimator}=await import('/map.js');
      const {infrastructure}=await import('/world.js');
      const {updateMarkup}=await import('/render.js');
      const fixtures=[[0,'wheelbarrow','handcart'],[2,'cargo-bicycle','scooter'],[4,'pickup','microvan'],[6,'box-truck','cargo-van'],[10,'rigid-truck','semi'],[14,'double-semi','semi'],[19,'freighter','cargo-jet']];
      const convoy=(key,download,upload)=>'data-route-key="'+key+'" data-download-rate="400000" data-upload-rate="200000" data-download-type="'+download+'" data-upload-type="'+upload+'"';
      const card=(stage,download,upload,key='stage-'+stage)=>'<figure><figcaption>Level '+(stage+1)+' · '+CITY_STAGES[stage].name+' · '+infrastructure(stage).name+(stage===19?' · Sea and air':'')+'</figcaption>'+renderCity({key,bytes:CITY_STAGES[stage].at,date:new Date(2026,9,8,12),convoy:convoy(key,download,upload)})+'</figure>';
      const gallery=document.querySelector('#gallery');gallery.innerHTML=fixtures.map(f=>card(...f)).join('');
      let now=0;
      const animator=new TransportAnimator({clock:()=>now,requestFrame:()=>1,cancelFrame:()=>{},wallClock:()=>new Date(2026,9,8,12)});
      animator.mount(gallery,{source:'gallery',active:true});now=3200;animator.tick();animator.draw();
      window.transportPreviewAnimator=animator;
      for(const svg of gallery.querySelectorAll('.application-city')) {
        const material=infrastructure(Number(svg.dataset.stage)).tier;
        if(svg.querySelectorAll('[data-scenery="'+material+'"]').length!==2)throw new Error('Missing road pair: '+material);
        for(const g of svg.querySelectorAll('.transport-vehicle'))if(!g.getAttribute('transform').endsWith('rotate(0)'))throw new Error('Vehicle rotated');
      }
      const probe=document.createElement('div');probe.style.cssText='position:absolute;left:0;top:0;width:900px';document.body.append(probe);
      let probeNow=0;
      const runner=new TransportAnimator({clock:()=>probeNow,requestFrame:()=>1,cancelFrame:()=>{},wallClock:()=>new Date(2026,9,8,12)});
      for(const mode of ['barge','cargo-plane','freight-train']) {
        updateMarkup(probe,card(0,mode,'pickup','probe'));
        runner.mount(probe,{source:mode,active:true});probeNow+=1000;runner.tick();runner.draw();
        const svg=probe.querySelector('svg'),selector=mode==='barge'?'.world-river':mode==='cargo-plane'?'.world-airport':'.world-rail';
        if(svg.querySelector(selector).getAttribute('opacity')!=='1')throw new Error('Preview corridor missing: '+mode);
        const vehicle=svg.querySelector('[data-transport="'+mode+'"]');
        const position=vehicle.getAttribute('transform');
        updateMarkup(probe,card(0,'pickup','pickup','probe'));runner.mount(probe,{source:mode,active:true});
        if(vehicle.getAttribute('transform')!==position)throw new Error('Existing journey jumped on fleet change');
        if(svg.querySelector(selector).getAttribute('opacity')!=='1')throw new Error('Active corridor disappeared');
        // Advance through real frame intervals: the animator bounds each step
        // so a suspended tab cannot teleport a delivery across the city.
        for(let elapsed=0;elapsed<13000;elapsed+=50){probeNow+=50;runner.tick();runner.draw();}
        if(svg.querySelector(selector).getAttribute('opacity')!=='0')throw new Error('Unused corridor did not retire');
      }
      runner.mount(document.createElement('div'),{source:'done',active:false});runner.resizeObserver?.disconnect();probe.remove();
      await Promise.all([...gallery.querySelectorAll('svg image')].map(node=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(new Error(node.getAttribute('href')));img.src=node.getAttribute('href');})));
      return {materials:fixtures.slice(0,6).map(f=>infrastructure(f[0]).tier),mixedSeaAir:true,corridorsDrain:true,departureGeometryRetained:true,flatSprites:true,allImagesLoaded:true};
    })()`);
    await new Promise(r=>setTimeout(r,1000));
    window.webContents.debugger.attach('1.3');
    const metrics=await window.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const full=await window.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(output,'progression-desktop.png'),Buffer.from(full.data,'base64'));
    window.webContents.debugger.detach();
    window.setSize(390,2100);await new Promise(r=>setTimeout(r,300));
    const phone=await window.webContents.executeJavaScript(`({
      overflow:document.documentElement.scrollWidth>innerWidth,
      rotated:[...document.querySelectorAll('.transport-vehicle')].some(g=>!g.getAttribute('transform').endsWith('rotate(0)'))
    })`);
    assert.equal(phone.overflow,false);assert.equal(phone.rotated,false);
    await writeFile(resolve(output,'progression-phone.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`window.transportPreviewAnimator.mount(document.createElement('div'),{source:'done',active:false});window.transportPreviewAnimator.resizeObserver?.disconnect();`);
    assert.deepEqual(errors,[]);
    await writeFile(resolve(output,'results.json'),JSON.stringify({checks,phone,errors},null,2));
    console.log('TRANSPORT_WORLD_VERIFIED '+JSON.stringify({checks,phone,errors}));
  }finally{window.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

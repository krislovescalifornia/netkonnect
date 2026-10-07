// Native visual review of every tier; no collectors or external assets.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {CITY_STAGES,cityArtwork} from '../public/cities.js';
import {VEHICLE_STAGES,vehicle} from '../public/vehicles.js';
import {createAppServer} from '../lib/http.mjs';
const output=resolve('test-results/progression');
app.setPath('userData',resolve('test-results/progression-profile'));
function units(n,suffix='') {
  if(!n)return 'Starting tier';
  const index=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));
  return `${n/1024**index} ${['B','KB','MB','GB','TB'][index]}${suffix}`;
}
app.whenReady().then(async()=>{
await mkdir(output,{recursive:true});
const cards=CITY_STAGES.map((city,i)=>{
  const transport=VEHICLE_STAGES[i];
  return `<article><header><b>${String(i+1).padStart(2,'0')}</b><h2>${city.name}</h2></header><p>${units(city.at)} recorded downloads</p><svg class="city" data-stage="${i}" viewBox="0 -30 330 180">${cityArtwork(i)}</svg><div class="vehicle"><svg viewBox="-85 -45 170 85">${vehicle(transport.id,true)}</svg></div><h3>${transport.name}</h3><p>${units(transport.at,'/s')} · ${transport.mode}</p></article>`;
}).join('');
const html=`<!doctype html><meta charset="utf-8"><title>netKonnect · 20 levels</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fa;color:#385065;font-family:Segoe UI,sans-serif;padding:32px}h1{margin:0;font-size:28px;font-weight:600}body>p{margin:8px 0 24px;color:#7c919e;font-size:13px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}article{background:white;border:1px solid #dce5eb;border-radius:12px;padding:14px 16px;height:345px}header{display:flex;gap:10px;align-items:center}header b{font-size:11px;color:#729b8c;background:#edf5ef;padding:6px;border-radius:5px}h2{font-size:14px;font-weight:600;margin:0}article p{font-size:10px;color:#8295a3;margin:5px 0}svg.city{width:100%;height:148px;display:block}.vehicle{border-top:1px solid #edf1f4;height:74px;display:flex;justify-content:center}.vehicle svg{height:74px;width:170px}h3{font-size:12px;margin:3px 0 0}.city-airdrop{display:none}.city[data-stage="0"] .site-crane,.city[data-stage="1"] .site-crane{display:none}svg *{animation:none!important}
</style><h1>From a tiny shack to a space-age metropolis</h1><p>20 city tiers + 20 supply vehicles · ink and watercolor illustrations · city growth and transport throughput progress independently</p><div class="grid">${cards}</div>`;
const path=resolve(output,'catalog.html');await writeFile(path,html);
const assets=createAppServer({getSnapshot:()=>({})});
const server=createServer((req,res)=>{if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}else assets.emit('request',req,res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const window=new BrowserWindow({show:false,width:1440,height:1810,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
try {
  await window.loadURL(`http://127.0.0.1:${server.address().port}`);
  const report=await window.webContents.executeJavaScript(`(async()=>{
    const {ILLUSTRATION_ASSETS}=await import('/illustration-art.js');
    const {TRUCK_ASSETS}=await import('/truck-art.js');
    const assets=[...ILLUSTRATION_ASSETS,...TRUCK_ASSETS];
    for(const name of assets){const image=new Image();image.src='/'+name;await image.decode();}
    const invalid=[...document.querySelectorAll('svg path')].filter(p=>{try{return !Number.isFinite(p.getTotalLength());}catch{return true;}}).length;
    const clippedLabels=[...document.querySelectorAll('article')].filter(card=>card.lastElementChild.getBoundingClientRect().bottom>card.getBoundingClientRect().bottom).length;
    return {cards:document.querySelectorAll('article').length,loadedAssets:assets.length,invalid,clippedLabels,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  assert.equal(report.cards,20);assert.equal(report.invalid,0);assert.equal(report.overflow,false);assert.deepEqual(errors,[]);
  assert.equal(report.clippedLabels,0);
  await new Promise(resolve=>setTimeout(resolve,500));
  window.webContents.debugger.attach('1.3');
  const metrics=await window.webContents.debugger.sendCommand('Page.getLayoutMetrics');
  const capture=await window.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
  await writeFile(resolve(output,'all-20-levels.png'),Buffer.from(capture.data,'base64'));
  await writeFile(resolve(output,'results.json'),JSON.stringify({...report,errors},null,2));
  console.log('PROGRESSION_UI_VERIFIED '+JSON.stringify(report));
}finally{window.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

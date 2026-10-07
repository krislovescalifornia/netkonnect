// Inspect partial homes and skylines across measured construction progress.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {CITY_STAGES,renderCity} from '../public/cities.js';
import {createAppServer} from '../lib/http.mjs';
const output=resolve('test-results/construction');
app.setPath('userData',resolve('test-results/construction-profile'));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const cards=[0,4,9,14,18,19].flatMap(stage=>[.08,.32,.58,.94].map(progress=>{
    const milestone=CITY_STAGES[stage],next=CITY_STAGES[stage+1];
    const bytes=milestone.at+(next?progress*(next.at-milestone.at):0);
    return `<article><h2>${milestone.name}</h2><p>${next?`${Math.round(progress*100)}% toward ${next.name}`:'Final tier · complete'}</p>${renderCity({key:`review-${stage}-${progress}`,bytes,busy:true})}</article>`;
  })).join('');
  const html=`<!doctype html><meta charset="utf-8"><title>netKonnect construction</title><link rel="stylesheet" href="/transport.css"><style>
  *{box-sizing:border-box}body{margin:0;padding:28px;background:#f4f7fa;color:#385065;font-family:Segoe UI,sans-serif}h1{font-size:25px;margin:0 0 8px}body>p{font-size:12px;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}article{background:white;border:1px solid #dce5eb;border-radius:12px;padding:14px;height:220px}h2{font-size:14px;margin:0 0 5px}article p{font-size:10px;margin:0;color:#7d919e}article svg.application-city{height:165px}.city-airdrop{display:none}svg *{animation:none!important;transition:none!important}
  </style><h1>Every delivery builds the next city</h1><p>Foundations → framing → building floors → finishing · staggered sites, cranes, scaffold crews and machinery</p><div class="grid">${cards}</div>`;
  await writeFile(resolve(output,'catalog.html'),html);
  const assets=createAppServer({getSnapshot:()=>({})});
  const server=createServer((req,res)=>{if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}else assets.emit('request',req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const window=new BrowserWindow({show:false,width:1440,height:1530,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}`);
    const report=await window.webContents.executeJavaScript(`(async()=>{
      const paths=[...new Set([...document.querySelectorAll('image')].map(i=>i.getAttribute('href')))];
      for(const path of paths){const image=new Image();image.src=path;await image.decode();}
      return {cities:document.querySelectorAll('.application-city').length,cranes:document.querySelectorAll('.site-crane').length,
        uniqueClips:new Set([...document.querySelectorAll('clipPath')].map(el=>el.id)).size,
        invalid:[...document.querySelectorAll('path')].filter(p=>!Number.isFinite(p.getTotalLength())).length,
        overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(report.cities,24);assert.equal(report.uniqueClips,24);assert.equal(report.invalid,0);assert.equal(report.overflow,false);assert.deepEqual(errors,[]);
    window.webContents.debugger.attach('1.3');
    const metrics=await window.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const capture=await window.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(output,'stages.png'),Buffer.from(capture.data,'base64'));
    await writeFile(resolve(output,'results.json'),JSON.stringify({...report,errors},null,2));
    console.log('CONSTRUCTION_UI_VERIFIED '+JSON.stringify(report));
  }finally{window.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

// Inspect partial homes and skylines across measured construction progress.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {CITY_STAGES,renderCity} from '../public/cities.js';
import {illustratedConstructionVehicle} from '../public/illustration-art.js';
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
  .machines{display:grid;grid-template-columns:repeat(3,1fr);background:white;border-radius:12px;margin:0 0 24px;padding:12px}.machines svg{width:100%;height:140px}.machines svg.small{height:42px}.machines div{text-align:center}.machines b{font-size:12px}
  </style><h1>Every delivery builds the next city</h1><p>Imagegen excavators and cement mixers · original transparent artwork · three paint variations</p><div class="machines">${['excavator','cement-mixer'].flatMap(id=>[0,1,2].map(paint=>`<div><b>${id==='excavator'?'Tracked excavator':'Cement mixer'}</b><svg viewBox="-25 -33 50 36">${illustratedConstructionVehicle(id,paint)}</svg><svg class="small" viewBox="-165 -36 330 40">${illustratedConstructionVehicle(id,paint)}</svg></div>`)).join('')}</div><p>Foundations → framing → building floors → finishing · staggered sites, cranes, scaffold crews and machinery</p><div class="grid">${cards}</div>`;
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
      const machines=[...document.querySelectorAll('.application-city .site-vehicle')];
      const transparentMachines=[];
      for(const path of paths.filter(path=>path.includes('/construction/activity/'))){
        const image=new Image();image.src=path;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        const rgba=ctx.getImageData(0,0,image.width,image.height).data;
        let clear=0,paint=0;for(let i=3;i<rgba.length;i+=4){if(rgba[i]===0)clear++;if(rgba[i]>240)paint++;}
        if(clear>image.width*image.height*.25&&paint>image.width*image.height*.08)transparentMachines.push(path);
      }
      const projects=[...document.querySelectorAll('.city-project')];
      const props=[...document.querySelectorAll('.crane-load,.site-supplies')];
      return {cities:document.querySelectorAll('.application-city').length,cranes:document.querySelectorAll('.site-crane').length,
        projects:projects.length,illustratedProjects:projects.filter(el=>el.querySelectorAll('.construction-phase image').length===4).length,
        geometricProjects:projects.filter(el=>el.querySelector('path,circle,ellipse')).length,
        props:props.length,illustratedProps:props.filter(el=>el.querySelector('image[href^="artwork/construction/projects/"]')||el.classList.contains('site-supplies')).length,
        geometricProps:props.filter(el=>el.querySelector('path,circle,ellipse')).length,
        machines:machines.length,illustratedMachines:machines.filter(el=>el.querySelector('image[href^="artwork/construction/"]')).length,
        geometricMachines:machines.filter(el=>el.querySelector('.illustrated-site-machine path,.illustrated-site-machine circle,.illustrated-site-machine ellipse')).length,transparentMachines,
        uniqueClips:new Set([...document.querySelectorAll('clipPath')].map(el=>el.id)).size,
        invalid:[...document.querySelectorAll('path')].filter(p=>!Number.isFinite(p.getTotalLength())).length,
        overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(report.cities,24);assert.equal(report.uniqueClips,24);assert.equal(report.invalid,0);assert.equal(report.overflow,false);assert.deepEqual(errors,[]);
    assert.equal(report.machines,112);assert.equal(report.illustratedMachines,report.machines);assert.equal(report.geometricMachines,0);assert.equal(report.transparentMachines.length,6);
    assert.equal(report.illustratedProjects,report.projects);assert.equal(report.geometricProjects,0);
    assert.equal(report.illustratedProps,report.props);assert.equal(report.geometricProps,0);
    window.webContents.debugger.attach('1.3');
    const metrics=await window.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const capture=await window.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(output,'stages.png'),Buffer.from(capture.data,'base64'));
    await writeFile(resolve(output,'results.json'),JSON.stringify({...report,errors},null,2));
    console.log('CONSTRUCTION_UI_VERIFIED '+JSON.stringify(report));
  }finally{window.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

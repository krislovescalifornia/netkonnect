// Review watercolor emblems in real badge contexts and the running dashboard.
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {brands,appIdentity,brandBadge} from '../public/brands.js';
import {BRAND_ART} from '../public/artwork/manifest.js';
import {createAppServer} from '../lib/http.mjs';
import {demoSnapshot} from '../public/demo.js';

const output=resolve('test-results/watercolor-icons');
app.setPath('userData',resolve('test-results/watercolor-icons-profile'));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const unique=[...new Map(Object.entries(brands).map(([key,[label,logo]])=>[logo,{key,label,logo}])).values()];
  const cards=unique.map(({key,label,logo})=>`<article><h2>${label}</h2><div class="large">${brandBadge(appIdentity(key))}</div><div class="samples"><div>${brandBadge(appIdentity(key))}<small>24px</small></div><div class="mini-apps">${brandBadge(appIdentity(key))}<small>19px</small></div><div class="service-destination">${brandBadge(appIdentity(key))}<small>18px</small></div><div class="dossier-heading">${brandBadge(appIdentity(key))}<small>32px</small></div></div><div class="source"><img src="/icons/${logo}.svg" width="22" height="22" alt=""> Original shape reference</div></article>`).join('');
  const gallery=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transport.css"><style>body{padding:28px;background:#f7f8f3;font-family:Segoe UI,sans-serif;color:#344858}h1{font:32px Georgia;margin:0 0 8px}p{font-size:12px;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}article{background:white;border:1px solid #dfe6da;border-radius:12px;padding:16px;text-align:center}h2{font-size:12px;margin:0 0 12px}.large{height:160px;display:grid;place-items:center}.large .brand-badge{width:156px;height:156px;border:0;background:transparent;box-shadow:none}.large .watercolor-brand{width:150px;height:150px}.samples{display:flex;gap:18px;align-items:center;justify-content:center;border-top:1px solid #eef1e9;padding-top:14px;margin-top:14px}.samples .mini-apps{position:static;display:flex}.samples>div{display:flex;flex-direction:column;gap:4px}.source{font-size:9px;color:#81917c;display:flex;align-items:center;justify-content:center;gap:7px;margin-top:15px}small{font-size:9px;color:#7f8f78}.service-destination{gap:4px}@media(max-width:600px){body{padding:16px}.grid{grid-template-columns:1fr}}</style><h1>A watercolor touch for every app</h1><p>22 local emblems · imagegen watercolor · enlarged and actual badge sizes</p><div class="grid">${cards}</div>`;
  const assets=createAppServer({getSnapshot:()=>({snapshot:demoSnapshot(),interval:2000,collecting:false,error:null}),getAnalytics:()=>({}),requestRestart:()=>({})});
  const server=createServer((req,res)=>{if(req.url==='/brand-review'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(gallery);}else assets.emit('request',req,res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level===3)errors.push(e.message);});
  const base=`http://127.0.0.1:${server.address().port}`,evaluate=code=>win.webContents.executeJavaScript(code);
  const decode=()=>evaluate(`Promise.all([...new Set([...document.querySelectorAll('.watercolor-brand image')].map(i=>i.getAttribute('href')))].map(p=>{const i=new Image();i.src=p;return i.decode();}))`);
  const shot=async name=>writeFile(resolve(output,name+'.png'),(await win.webContents.capturePage()).toPNG());
  const report={assets:Object.keys(BRAND_ART).length,layouts:[]};
  try{
    await win.loadURL(base+'/brand-review');await decode();
    const alpha=await evaluate(`(async()=>{const result=[];for(const path of [...new Set([...document.querySelectorAll('.watercolor-brand image')].map(i=>i.getAttribute('href')))]){const im=new Image();im.src=path;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;result.push({path,transparentCorners:[3,(c.width-1)*4+3,(c.height-1)*c.width*4+3,d.length-1].every(i=>d[i]===0),painted:d.some((v,i)=>i%4===3&&v>32)});}return result;})()`);
    assert.equal(alpha.length,22);for(const a of alpha){assert.ok(a.transparentCorners,a.path);assert.ok(a.painted,a.path);}report.alpha=alpha;
    const sizes=await evaluate(`[...document.querySelectorAll('article:first-child .samples .watercolor-brand')].map(e=>e.getBoundingClientRect().width)`);
    assert.deepEqual(sizes,[24,19,18,32]);report.badgeSizes=sizes;
    win.webContents.debugger.attach('1.3');
    const metrics=await win.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const capture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(output,'watercolor-badges.png'),Buffer.from(capture.data,'base64'));
    for(const width of [1280,390]){
      win.setSize(width,1000);await win.loadURL(base);await new Promise(r=>setTimeout(r,400));
      for(const page of ['overview','connections','secrets']){
        if(page!=='overview')await evaluate(`document.querySelector('[data-page="${page}"]').click();window.scrollTo(0,0)`);
        await new Promise(r=>setTimeout(r,150));await decode();
        assert.equal(await evaluate(`document.querySelector('.nav-item.active').dataset.page`),page);
        const layout=await evaluate(`(()=>{const badges=[...document.querySelectorAll('.watercolor-brand')];return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,count:badges.length,allFit:badges.every(e=>{const b=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return (b.width===0&&b.height===0)||(b.width>0&&b.height>0&&b.left>=p.left&&b.right<=p.right&&b.top>=p.top&&b.bottom<=p.bottom);} ),legacy:document.querySelectorAll('.brand-badge img[src^="/icons/"]').length};})()`);
        assert.equal(layout.overflow,false);assert.ok(layout.count>0);assert.ok(layout.allFit);assert.equal(layout.legacy,0);report.layouts.push({page,...layout});await shot(page+'-'+width);
      }
    }
    assert.deepEqual(errors,[]);await writeFile(resolve(output,'qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{win.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

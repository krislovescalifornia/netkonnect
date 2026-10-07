// Review generated illustration spots in the shipped UI and at miniature sizes.
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {demoSnapshot} from '../public/demo.js';
import {DETAIL_ART} from '../public/artwork/manifest.js';
import {illustratedDetail} from '../public/illustration-art.js';

const output=resolve('test-results/decoration');
const sizes={'house-build':[36,44],'tower-build':[42,64],'site-supplies':[34,15],'crane-load':[10,22],'delivery-parcel':[12,11],'little-secrets':[72,72],'setup-crew':[48,48],'quiet-companion':[52,52]};
app.setPath('userData',resolve('test-results/decoration-profile'));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const cards=Object.entries(DETAIL_ART).flatMap(([id,art])=>art.frames.map((_,frame)=>{
    const [width,height]=sizes[id];
    const phases=id==='setup-crew'?['Working','Needs attention','Complete']:['Foundations','Framing','Building floors','Finishing'];
    return `<article><h2>${id.replaceAll('-',' ')}${art.frames.length>1?' · '+phases[frame]:''}</h2><svg class="large" viewBox="-70 -155 140 160">${illustratedDetail(id,130,0,150,frame)}</svg><div class="mini"><svg width="160" height="80" viewBox="-80 -74 160 80">${illustratedDetail(id,width,0,height,frame)}</svg><small>Actual scene size</small></div></article>`;
  })).join('');
const gallery=`<!doctype html><meta charset="utf-8"><title>netKonnect artwork review</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/analytics.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/setup.css"><style>body{padding:28px;background:#f6f8f4;color:#385065;font-family:Segoe UI,sans-serif}h1{font:32px Georgia;margin:0 0 8px}body>p{font-size:12px;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}article{background:white;border:1px solid #dde5db;border-radius:12px;padding:16px;text-align:center}article h2{font-size:12px;font-weight:550;min-height:30px}article .large{width:100%;height:166px}.mini{border-top:1px solid #eff2ec;margin-top:10px}small{display:block;color:#82917a;font-size:10px}.setup-review{max-width:1000px;margin:auto}</style><h1>The illustrated finishing touches</h1><p>Original imagegen pixels · enlarged review and actual scene sizes</p><div class="grid">${cards}</div><div id="setup-review" class="setup-review"></div>`;
  const assets=createAppServer({getSnapshot:()=>({snapshot:demoSnapshot(),interval:2000,collecting:false,error:null}),getAnalytics:()=>({}),requestRestart:()=>({})});
  const server=createServer((req,res)=>{
    if(req.url==='/artwork-review'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(gallery);}
    else assets.emit('request',req,res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const win=new BrowserWindow({show:false,width:1440,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const base=`http://127.0.0.1:${server.address().port}`;
  const evaluate=code=>win.webContents.executeJavaScript(code);
  const decode=()=>evaluate(`Promise.all([...document.querySelectorAll('img')].map(i=>i.decode()))`);
  const screenshot=async name=>writeFile(resolve(output,name+'.png'),(await win.webContents.capturePage()).toPNG());
  const report={layouts:[]};
  try {
    await win.loadURL(base);await new Promise(r=>setTimeout(r,700));await decode();
    win.webContents.debugger.attach('1.3');
    assert.equal(await evaluate(`document.querySelector('.secret-postcard-art')?.naturalWidth>0`),true);
    const postcard=await evaluate(`(()=>{const b=document.querySelector('.secret-postcard').getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,width:b.width,height:b.height,scale:1};})()`);
    const postcardCapture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:postcard});
    await writeFile(resolve(output,'postcard.png'),Buffer.from(postcardCapture.data,'base64'));
    await evaluate(`document.querySelector('[data-page="secrets"]').click();window.scrollTo(0,0)`);await decode();
    for(const width of [1440,760,390]) {
      win.setSize(width,1100);await new Promise(r=>setTimeout(r,100));
      const layout=await evaluate(`(()=>{const art=document.querySelector('.secrets-art img');const b=art.getBoundingClientRect();const c=art.closest('.secrets-banner').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,imageLoaded:art.complete&&art.naturalWidth>0,imageFits:b.left>=c.left&&b.right<=c.right&&b.top>=c.top&&b.bottom<=c.bottom};})()`);
      assert.equal(layout.overflow,false);assert.equal(layout.imageLoaded,true);assert.equal(layout.imageFits,true);report.layouts.push(layout);
      await screenshot('secrets-'+width);
    }
    win.setSize(1240,1100);await win.loadURL(base+'/artwork-review');
    const paths=await evaluate(`[...new Set([...document.querySelectorAll('image')].map(i=>i.getAttribute('href')))]`);
    await evaluate(`Promise.all(${JSON.stringify(paths)}.map(p=>{const image=new Image();image.src=p;return image.decode();}))`);
    const metrics=await win.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const capture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(output,'details.png'),Buffer.from(capture.data,'base64'));
    report.detailSheets=paths.length;
    if(DETAIL_ART['setup-crew']) {
      await evaluate(`(async()=>{
        document.querySelector('.grid').remove();document.querySelector('h1').textContent='A little crew for every step';document.querySelector('body>p').textContent='Actual setup and Preferences components · simulated status, no OS changes';
        window.artworkSetup={startupAvailable:true,detailedAvailable:true,startup:true,detailedStartup:true,database:'Local field journal',checks:[{id:'companion',label:'Background companion',ready:true},{id:'capture',label:'Measured capture',ready:false}]};
        window.netKonnect={setupStatus:async()=>window.artworkSetup};window.artworkUI=await import('/companion-ui.js');
      })()`);
      report.setup=[];
      for(const [state,step,percent] of [['running',3,33],['error',3,33],['complete',6,100]]) {
        await evaluate(`(async()=>{
          window.artworkSetup.complete=${state==='complete'};
          window.artworkSetup.checks=window.artworkSetup.checks.map(c=>({...c,ready:${state==='complete'}||c.id==='companion'}));
          window.artworkSetup.progress={state:'${state}',step:${step},percent:${percent},startedAt:Date.now(),${state==='error'?"error:'A collection check needs attention. Try the Easy Button again.',":''}};
          await window.artworkUI.refreshSetupStatus(true);
          document.querySelector('#setup-review').innerHTML=await window.artworkUI.companionPreferences();
          document.querySelector('.collection-controls').open=true;
        })()`);
        await decode();
        await evaluate(`(async()=>{const image=new Image();image.src='/artwork/details/setup-crew.png';await image.decode();})()`);
        for(const width of [1240,390]) {
          win.setSize(width,1100);await new Promise(r=>setTimeout(r,100));
          const setup=await evaluate(`(()=>{const portrait=document.querySelector('.journey-mascot'),b=portrait.getBoundingClientRect(),p=portrait.closest('.setup-journey').getBoundingClientRect();return {state:'${state}',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,crewImage:!!portrait.querySelector('image[href="artwork/details/setup-crew.png"]'),portraitFits:b.left>=p.left&&b.right<=p.right&&b.top>=p.top&&b.bottom<=p.bottom,companionLoaded:document.querySelector('.companion-art').naturalWidth>0,decorative:portrait.querySelector('svg').getAttribute('aria-hidden')==='true',animation:getComputedStyle(portrait).animationName};})()`);
          assert.equal(setup.overflow,false);assert.equal(setup.crewImage,true);assert.equal(setup.portraitFits,true);assert.equal(setup.companionLoaded,true);assert.equal(setup.decorative,true);
          if(state!=='running')assert.equal(setup.animation,'none');
          report.setup.push(setup);await screenshot('setup-'+state+'-'+width);
        }
      }
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await evaluate(`document.querySelector('.setup-journey').classList.remove('landed','halted')`);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.journey-mascot')).animationName`),'none');
      report.setupReducedMotion=true;
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      win.setSize(900,1000);await win.loadURL(base);await new Promise(r=>setTimeout(r,600));
      await evaluate(`(async()=>{
        const snapshot=await (await fetch('/api/snapshot')).json();
        window.netKonnect={snapshot:async()=>snapshot,setupStatus:async()=>({complete:true,startup:true,detailedStartup:true,startupAvailable:true,detailedAvailable:true,database:'Local field journal',checks:[],progress:{state:'complete',step:6,percent:100,startedAt:Date.now()}})};
        document.querySelector('[data-action="settings"]').click();
      })()`);
      await new Promise(r=>setTimeout(r,100));
      for(const width of [900,390]) {
        win.setSize(width,1000);await new Promise(r=>setTimeout(r,100));
        await evaluate(`document.querySelector('.collection-controls').open=true;document.querySelector('.companion-note').scrollIntoView({block:'center',behavior:'instant'})`);await decode();
        const drawer=await evaluate(`(()=>{const d=document.querySelector('.drawer'),art=d.querySelector('.companion-art'),a=art.getBoundingClientRect(),b=d.getBoundingClientRect();return {width:innerWidth,imageLoaded:art.naturalWidth>0,imageFits:a.left>=b.left&&a.right<=b.right,overflow:d.scrollWidth>d.clientWidth};})()`);
        assert.equal(drawer.imageLoaded,true);assert.equal(drawer.imageFits,true);assert.equal(drawer.overflow,false);
        report.preferences??=[];report.preferences.push(drawer);await screenshot('preferences-'+width);
      }
    }
    assert.deepEqual(errors,[]);
    await writeFile(resolve(output,'results.json'),JSON.stringify({...report,errors},null,2));
    console.log('DECORATION_UI_VERIFIED '+JSON.stringify(report));
  } finally {win.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

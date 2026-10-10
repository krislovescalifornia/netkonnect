// Render all twenty project designs and exercise real road/rail/water handoffs.
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {CITY_STAGES,renderCity} from '../public/cities.js';
import {projectArtwork,PROJECT_NAMES} from '../public/construction-art.js';
const out=resolve('test-results/project-logistics');
app.setPath('userData',resolve('test-results/project-logistics-profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  await mkdir(out,{recursive:true});
  const gallery=PROJECT_NAMES.map((name,stage)=>`<article><h2>Level ${stage+1} · ${name}</h2><div class="phases">${[.08,.35,.65,.84].map(p=>`<svg viewBox="-55 -100 110 105">${projectArtwork(stage,p,95,92)}</svg>`).join('')}</div></article>`).join('');
  const live=['semi','freight-train','freighter'].map((type,i)=>`<article class="live-card"><h2>${['Road delivery','Rail gantry unloading','Waterfront pier unloading'][i]}</h2>${renderCity({key:type,bytes:CITY_STAGES[14].at+(CITY_STAGES[15].at-CITY_STAGES[14].at)*.42,busy:true,convoy:`data-route-key="${type}" data-download-rate="100000" data-upload-rate="0" data-download-type="${type}" data-upload-type="semi"`})}</article>`).join('');
  const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/transport.css"><style>*{box-sizing:border-box}body{background:#eef1e6;color:#294737;font:13px Segoe UI;margin:0;padding:24px}h1{font-size:24px}h2{font-size:12px;margin:0 0 10px}article{background:#fffdf5;border:1px solid #c8d2bd;border-radius:12px;padding:14px}.live-card{margin-bottom:16px}.live-card svg.application-city{height:280px;width:100%;overflow:hidden}.catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.phases{display:flex}.phases svg{width:25%;height:140px}#live{max-width:1300px;margin:auto}</style><h1>Twenty watercolor construction projects</h1><p>Measured foundations → scaffolds → floors → finishing; live deliveries feed the work yards.</p><section id="live">${live}</section><section class="catalog">${gallery}</section><script type="module">import {TransportAnimator} from '/map.js';import {updateCityGrowth} from '/cities.js';import {updateSVGMarkup} from '/render.js';import {worldNature} from '/world.js';window.qa={animator:new TransportAnimator({clock:()=>0,requestFrame:()=>null,cancelFrame:()=>{}}),updateCityGrowth,updateSVGMarkup,worldNature};qa.animator.mount(document.querySelector('#live'),{source:'qa',active:false});for(const [key,lane] of qa.animator.queue.lanes){lane.vehicles=key.endsWith('|download')?[{id:1,type:key.split('|')[0],incoming:true,started:0,arrives:12000}]:[];}qa.animator.draw();window.ready=true;</script>`;
  const assets=createAppServer({getSnapshot:()=>({})});
  const server=createServer((req,res)=>{if(req.url==='/review'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else assets.emit('request',req,res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1440,height:1150,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
  const run=code=>window.webContents.executeJavaScript(code),errors=[];
  window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const capture=async name=>writeFile(resolve(out,name),(await window.webContents.capturePage()).toPNG());
  const sample=p=>run(`qa.animator.queue.now=${p}*12000;qa.animator.draw();[...document.querySelectorAll('#live .material-transfer')].map(el=>({material:el.dataset.material,progress:el.dataset.transferProgress,transform:el.getAttribute('transform'),opacity:+el.style.opacity,carrier:+el.querySelector('.transfer-carrier').style.opacity,cable:+el.querySelector('.unloading-cable').style.opacity}))`);
  try{
    await window.loadURL(`http://127.0.0.1:${server.address().port}/review`);
    for(let i=0;i<50&&!await run('window.ready===true');i++)await wait(100);
    await run(`Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async src=>{const image=new Image();image.src=src;await image.decode();}))`);
    const sizes=[];
    for(const [label,width] of [['desktop',1440],['compact',820],['mobile',460]]){
      window.setSize(width,1150);await wait(300);
      // Journeys retain their original coordinates on resize. Start new ones
      // at each size to review that size's own bays and work-yard positions.
      await run(`qa.animator.mount(document.querySelector('#live'),{source:${JSON.stringify(label)},active:false});for(const [key,lane] of qa.animator.queue.lanes){lane.vehicles=key.endsWith('|download')?[{id:1,type:key.split('|')[0],incoming:true,started:0,arrives:12000}]:[];}qa.animator.draw()`);
      const unloaded=await sample(.70);await capture(label+'-lift.png');
      const pixelsA=(await window.webContents.capturePage()).toBitmap();
      const carrying=await sample(.84);await capture(label+'-carry.png');
      const pixelsB=(await window.webContents.capturePage()).toBitmap();
      assert.ok(unloaded.slice(1).every(p=>p.cable===1),'Rail and water loads attach to a crane cable');
      assert.ok(carrying.every(p=>p.carrier===1),'A crew carries every delivered material');
      assert.ok(carrying.every((p,i)=>p.transform!==unloaded[i].transform),'Loads visibly leave their vehicles');
      let changed=0;for(let i=0;i<Math.min(pixelsA.length,pixelsB.length);i+=4)if(Math.abs(pixelsA[i]-pixelsB[i])+Math.abs(pixelsA[i+1]-pixelsB[i+1])+Math.abs(pixelsA[i+2]-pixelsB[i+2])>45)changed++;
      assert.ok(changed>150,'Rendered unloading motion changes painted pixels');
      await sample(.97);await capture(label+'-installed.png');
      const stocks=await run(`[...document.querySelectorAll('#live .application-city')].map(svg=>({count:svg.querySelectorAll('.site-stock [data-delivery-id]').length,materials:[...svg.querySelectorAll('.site-stock [data-material]')].map(el=>el.dataset.material)}))`);
      assert.ok(stocks.every(stock=>stock.count>=1),'Cargo remains in its construction yard after handoff');
      sizes.push({label,changed,unloaded,carrying,stocks});
    }
    window.setSize(1440,1150);await wait(300);
    await run(`document.querySelector('#live').style.display='none';scrollTo(0,0)`);await wait(200);await capture('all-projects-top.png');
    window.webContents.debugger.attach('1.3');
    const metrics=await window.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const shot=await window.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(out,'all-projects.png'),Buffer.from(shot.data,'base64'));
    await run(`document.querySelector('#live').style.display='';scrollTo(0,0);window.probe={svg:document.querySelector('#live svg.application-city'),crew:document.querySelector('#live .crew-walker')};probe.animation=probe.crew.getAnimations()[0];probe.stock=probe.svg.querySelector('.site-stock');`);await wait(300);
    const before=(await window.webContents.capturePage()).toBitmap();
    await run(`qa.updateCityGrowth(probe.svg,14,.68)`);await wait(1600);
    const after=(await window.webContents.capturePage()).toBitmap();
    let growthPixels=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>60)growthPixels++;
    assert.ok(growthPixels>250,'Measured downloads visibly change unfinished architecture');
    assert.equal(await run('probe.crew.getAnimations()[0]===probe.animation'),true,'Growth retains crew timeline');
    await capture('measured-growth.png');
    await run(`document.querySelector('#live').classList.add('still');`);await wait(200);
    const paused=await run(`probe.crew.getAnimations()[0].currentTime`);await wait(600);
    assert.equal(await run('probe.crew.getAnimations()[0].currentTime'),paused,'Pause freezes live crew');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await run(`matchMedia('(prefers-reduced-motion: reduce)').matches`),true);
    assert.equal(await run(`probe.crew.getAnimations().length`),0,'Reduced motion suppresses work animation');
    assert.deepEqual(errors,[]);
    await writeFile(resolve(out,'results.json'),JSON.stringify({designs:PROJECT_NAMES.length,phases:80,sizes,growthPixels,errors},null,2));
    console.log('PROJECT_LOGISTICS_VERIFIED '+JSON.stringify({designs:20,phases:80,sizes:sizes.map(s=>({size:s.label,pixels:s.changed})),growthPixels,errors}));
  }finally{window.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

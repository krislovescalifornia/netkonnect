// Review original cranes and every authored load state, then drive real journeys.
import {app,BrowserWindow,nativeImage} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {CRANE_ART,craneArtwork} from '../public/crane-art.js';
import {VEHICLE_STAGES,vehicle} from '../public/vehicles.js';
import {CITY_STAGES,renderCity} from '../public/cities.js';
const out=resolve('test-results/crane-deliveries');
app.setPath('userData',resolve(out,'profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  await mkdir(out,{recursive:true});
  const cranes=CRANE_ART.slice(0,10).map(art=>{const a=craneArtwork(art,160,170);return `<article><b>${art.id}</b><svg viewBox="-110 0 220 190">${a.image}<path d="M${a.rig.x} ${a.rig.y}v${a.rig.rest}" stroke="#526a79" fill="none"/></svg></article>`;}).join('');
  const fleet=VEHICLE_STAGES.map(s=>`<article><b>${s.name}</b><div class="pair">${[false,true].map(empty=>`<div><small>${empty?'Departing empty':'Arriving loaded'}</small><svg viewBox="${-s.width/2-14} -48 ${s.width+28} 62">${vehicle(s.id,true,0).replace('<g class="vehicle-cargo">',`<g class="vehicle-cargo" opacity="${empty?0:1}">`)}</svg></div>`).join('')}</div></article>`).join('');
  const live=['handcart','pickup','semi'].map((type,i)=>`<article>${renderCity({key:type,bytes:CITY_STAGES[5+i*4].at*1.3,busy:true,convoy:`data-route-key="${type}" data-download-rate="100000" data-upload-rate="0" data-download-type="${type}" data-upload-type="semi"`})}</article>`).join('');
  const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/transport.css"><style>body{margin:24px;background:#f4f5eb;color:#294737;font:14px Segoe UI}h1{font-size:24px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}article{background:#fffdf6;border:1px solid #bccab3;border-radius:10px;padding:12px}article svg{width:100%;height:180px}.pair{display:flex}.pair>div{width:50%}.pair svg{height:95px}.pair small{font-size:11px}#fleet{grid-template-columns:repeat(4,1fr)}#live article{margin:12px 0}#live svg{height:280px}#live{display:none}</style><h1 id="heading">Ten additional watercolor cranes</h1><section id="cranes" class="grid">${cranes}</section><section id="fleet" class="grid" style="display:none">${fleet}</section><section id="live">${live}</section><script type="module">import {TransportAnimator} from '/map.js';window.qa={animator:new TransportAnimator({clock:()=>0,requestFrame:()=>null,cancelFrame:()=>{}})};window.ready=true;</script>`;
  const assets=createAppServer({getSnapshot:()=>({})});
  const server=createServer((req,res)=>{if(req.url==='/review'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else assets.emit('request',req,res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const win=new BrowserWindow({show:false,width:1440,height:1150,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code),errors=[],reports=[];
  win.webContents.on('console-message',e=>{if(e.level==='error'||e.level===3)errors.push(e.message);});
  const capture=async name=>{await wait(150);await writeFile(resolve(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  try{
    await win.loadURL(`http://127.0.0.1:${server.address().port}/review`);
    for(let i=0;i<50&&!await run('window.ready===true');i++)await wait(100);
    await run(`Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async src=>{const i=new Image();i.src=src;await i.decode();}))`);
    await capture('cranes');
    for(const art of CRANE_ART.slice(0,10)){
      const bitmap=nativeImage.createFromPath(resolve('public/artwork/cranes',art.id+'.png')).toBitmap();
      assert.ok(bitmap.some((v,i)=>i%4===3&&v===0),'Real transparency: '+art.id);
    }
    await run(`document.querySelector('#cranes').style.display='none';document.querySelector('#fleet').style.display='grid';document.querySelector('#heading').textContent='Authored cargo states — load stays in the cargo bed';`);
    win.webContents.debugger.attach('1.3');
    const metrics=await win.webContents.debugger.sendCommand('Page.getLayoutMetrics');
    const shot=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(resolve(out,'fleet.png'),Buffer.from(shot.data,'base64'));
    await run(`document.querySelector('#fleet').style.display='none';document.querySelector('#live').style.display='block';document.querySelector('#heading').textContent='Loaded arrivals, rear-bay unloading, empty departures';`);
    for(const [name,width] of [['desktop',1440],['compact',820],['phone',390]]){
      win.setSize(width,1150);await wait(250);
      await run(`qa.animator.mount(document.querySelector('#live'),{source:${JSON.stringify(name)},active:false});for(const [key,lane] of qa.animator.queue.lanes)lane.vehicles=key.endsWith('|download')?[{id:1,type:key.split('|')[0],incoming:true,started:0,arrives:12000}]:[];qa.animator.draw();`);
      const states=[];
      for(const [phase,p] of [['arriving',.5],['unloading',.7],['departing',.88]]){
        const state=await run(`qa.animator.queue.now=${p}*12000;qa.animator.draw();[...document.querySelectorAll('#live .incoming-fleet')].map(g=>({type:g.dataset.transport,cargo:+g.querySelector('.vehicle-cargo').getAttribute('opacity'),roofParcel:!!g.querySelector('.vehicle-material'),transfer:+g.closest('svg').querySelector('.material-transfer').getAttribute('opacity')}))`);
        assert.equal(state.length,3);assert.ok(state.every(s=>!s.roofParcel));
        if(phase==='arriving')assert.ok(state.every(s=>s.cargo===1&&s.transfer===0));
        if(phase==='departing')assert.ok(state.every(s=>s.cargo===0));
        states.push({phase,state});await capture(name+'-'+phase);
      }
      const rear=await run(`[...qa.animator.svgs.values()].map(svg=>{const r=[...qa.animator.vehicleNodes.get(svg).values()][0];return {rear:r.unloadFrom.x<r.route.at(-1).x,ground:r.unloadFrom.y>200};})`);
      assert.ok(rear.every(r=>r.rear&&r.ground));reports.push({name,states,rear});
    }
    assert.deepEqual(errors,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({reports,errors},null,2));
    console.log('CRANE_DELIVERIES_OK');
  }finally{win.destroy();server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

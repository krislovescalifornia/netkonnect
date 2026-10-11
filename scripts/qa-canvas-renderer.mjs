// Real canvas pixels, not SVG animation-node counts, establish visible activity.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createLivingCityPreview} from './preview-living-city.mjs';
const output=resolve('test-results/canvas-renderer');
app.setPath('userData',resolve(output,'profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const server=createLivingCityPreview();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:true,width:1400,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=code=>window.webContents.executeJavaScript(code),errors=[],results=[];
  window.webContents.on('console-message',e=>{if(e.level==='error'||e.level===3)errors.push(e.message);});
  const capture=async name=>{await wait(120);return writeFile(resolve(output,name+'.png'),(await window.webContents.capturePage()).toPNG());};
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/living-preview`);await wait(1800);
    await run(`window.qa={animator:livingPreview.animator};qa.svg=document.querySelector('.application-city');qa.painter=qa.animator.canvases.get(qa.svg);void 0;`);
    // Separate each activity's painted pixels while retaining all transforms,
    // clipping and artwork. This cannot pass because of unrelated road traffic.
    for(const [size,width] of [['desktop',1400],['compact',820],['mobile',460]]) {
      window.setSize(width,1100);await wait(700);await capture(size+'-a');
      const motion=await run(`(async()=>{
        const p=qa.painter,original=p.drawNode;const classes=['city-residents','site-vehicle','crew-builder','crew-walker','crane-load'];
        const result={};
        for(const selected of classes){
          let depth=0;
          p.drawNode=function(n,ctx,time,uncached){
            const match=n.has(selected);if(match)depth++;
            const primitive=['image','path','circle','ellipse','rect','line','polygon','polyline'].includes(n.tag);
            const cacheable=n.cacheable;n.cacheable=false;
            if(depth||!primitive)original.call(this,n,ctx,time,true);
            n.cacheable=cacheable;if(match)depth--;
          };
          const frame=()=>{qa.animator.draw();return p.ctx.getImageData(0,0,p.canvas.width,p.canvas.height).data;};
          const before=frame();await new Promise(r=>setTimeout(r,700));const after=frame(),quarters=[0,0,0,0];
          for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])+Math.abs(before[i+3]-after[i+3])>50)quarters[Math.min(3,Math.floor((i/4%p.canvas.width)/p.canvas.width*4))]++;
          result[selected]=quarters;p.drawNode=original;
        }
        qa.animator.draw();return result;
      })()`);
      console.log(size,JSON.stringify(motion));
      for(const [kind,pixels] of Object.entries(motion))if(kind!=='crane-load')assert.ok(pixels.reduce((a,b)=>a+b)>20,`${size}: ${kind} actually changes pixels`);
      assert.ok(motion['city-residents'].filter(n=>n>10).length>=3,`${size}: residents move across the city`);
      results.push({size,motion});await capture(size+'-b');
    }
    assert.ok(results.some(r=>r.motion['crane-load'].reduce((a,b)=>a+b)>20),'Delivered loads visibly move on cranes');
    window.setSize(1400,1100);await wait(500);
    const continuity=await run(`(()=>{const p=qa.painter,t=p.time,n=p.nodes.get(qa.svg.querySelector('.resident-walk'));document.querySelector('#sort').click();document.querySelector('#sort').click();livingPreview.render();return {samePainter:qa.animator.canvases.get(qa.svg)===p,sameActor:p.nodes.get(qa.svg.querySelector('.resident-walk'))===n,clock:p.time>=t};})()`);
    assert.deepEqual(continuity,{samePainter:true,sameActor:true,clock:true});
    const traffic=await run(`(async()=>{
      const p=qa.painter,svg=qa.svg,style=svg.getAttribute('style'),actor=p.nodes.get(svg.querySelector('.resident-walk'));
      const original=p.refresh,paint=p.paint,paints=[];let rootRefreshes=0;
      p.refresh=function(n){if(n===p.root)rootRefreshes++;return original.call(this,n);};
      p.paint=function(...args){paints.push(performance.now());return paint.apply(this,args);};
      const readRoad=()=>p.ctx.getImageData(0,Math.floor(p.canvas.height*.8),p.canvas.width,Math.floor(p.canvas.height*.2)).data;
      const before=readRoad();await new Promise(r=>setTimeout(r,250));const after=readRoad();
      let movingPixels=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>50)movingPixels++;
      for(const type of ['semi','handcart','semi']){
        const input=document.querySelector('#fleet');input.value=type;input.dispatchEvent(new Event('change'));
        await new Promise(r=>setTimeout(r,2100));
      }
      p.refresh=original;p.paint=paint;
      const intervals=paints.slice(1).map((t,i)=>t-paints[i]).sort((a,b)=>a-b);
      return {movingPixels,rootRefreshes,styleRetained:style===svg.getAttribute('style'),actorRetained:actor===p.nodes.get(svg.querySelector('.resident-walk')),frames:paints.length,p95:intervals[Math.floor(intervals.length*.95)],max:intervals.at(-1)};
    })()`);
    assert.ok(traffic.movingPixels>20,'Road traffic changes actual painted pixels');
    assert.equal(traffic.rootRefreshes,0,'Road vehicle changes and polls never refresh the entire scene');
    assert.ok(traffic.styleRetained&&traffic.actorRetained,'Polling retains layout styles and actor timelines');
    assert.ok(traffic.frames>300&&traffic.p95<25,'Traffic paints at display cadence through multiple polls');
    assert.ok(traffic.max<50,'Polling and road vehicle changes do not stall painted traffic');
    console.log('TRAFFIC_CONTINUITY '+JSON.stringify(traffic));
    await run(`document.querySelector('#motion').click()`);await wait(100);
    const paused=await run(`qa.painter.canvas.toDataURL()`);await wait(800);assert.equal(await run(`qa.painter.canvas.toDataURL()`),paused,'Pause freezes actual pixels');
    const growth=await run(`(()=>{const before=qa.painter.canvas.toDataURL(),input=document.querySelector('#growth');input.value=85;input.dispatchEvent(new Event('input'));return {changed:before!==qa.painter.canvas.toDataURL(),progress:[...qa.svg.querySelectorAll('.city-project')].map(n=>Number(n.dataset.buildProgress))};})()`);
    assert.equal(growth.changed,true,'Measured growth updates painted construction while paused');await capture('growth-paused');
    await run(`document.querySelector('#motion').click();document.querySelector('#gallery').classList.add('no-motion');livingPreview.render()`);await wait(100);
    const disabled=await run(`qa.painter.canvas.toDataURL()`);await wait(800);assert.equal(await run(`qa.painter.canvas.toDataURL()`),disabled,'Motion preference freezes actual pixels');
    await run(`document.querySelector('#gallery').classList.remove('no-motion');livingPreview.render()`);
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(100);
    const reduced=await run(`qa.painter.canvas.toDataURL()`);await wait(800);assert.equal(await run(`qa.painter.canvas.toDataURL()`),reduced,'Reduced motion freezes pixels');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await run(`document.querySelector('#lighting').value=21;document.querySelector('#lighting').dispatchEvent(new Event('change'));`);await wait(700);await capture('night');
    await run(`document.querySelector('#traffic').click();for(const lane of qa.animator.queue.lanes.values())lane.vehicles=[];qa.animator.draw();`);await wait(100);
    const idle=await run(`({work:qa.painter.workTime,time:qa.painter.time,progress:[...qa.svg.querySelectorAll('.city-project')].map(n=>n.dataset.buildProgress)})`);await wait(1000);
    const idleAfter=await run(`({work:qa.painter.workTime,time:qa.painter.time,progress:[...qa.svg.querySelectorAll('.city-project')].map(n=>n.dataset.buildProgress)})`);
    assert.equal(idleAfter.work,idle.work,'Construction clock rests without deliveries');assert.ok(idleAfter.time>idle.time,'Residents remain active');assert.deepEqual(idleAfter.progress,idle.progress,'Ambient motion cannot grow the city');
    await run(`document.querySelector('#lighting').value=12;document.querySelector('#lighting').dispatchEvent(new Event('change'));`);
    for(const [name,width] of [['desktop',1400],['compact',820],['mobile',460]]) {
      window.setSize(width,1100);await wait(400);
      const footer=await run(`(()=>{const card=qa.svg.closest('.application-city-card'),label=card.querySelector('.city-idle-label'),button=card.querySelector('.route-expand'),caret=button.querySelector('.app-info-caret'),text=button.querySelector('strong'),b=button.getBoundingClientRect(),c=caret.getBoundingClientRect(),t=text.getBoundingClientRect();return {label:label.textContent,above:label.getBoundingClientRect().bottom<=b.top,gap:c.left-t.right,padding:b.right-c.right,caretWidth:c.width,overlay:!!card.querySelector('.application-scene .road-idle'),fits:card.scrollWidth<=card.clientWidth+1};})()`);
      assert.equal(footer.label,'Idle');assert.ok(footer.above);assert.ok(footer.gap>=8);assert.ok(footer.padding>=6);assert.ok(footer.caretWidth>=18);assert.equal(footer.overlay,false);assert.ok(footer.fits);
      await capture('idle-'+name);
    }
    await run(`qa.svg.setAttribute('data-offscreen','');qa.paints=qa.painter.repaints`);await wait(500);assert.equal(await run('qa.painter.repaints'),await run('qa.paints'),'Offscreen city does not paint');
    await run(`qa.svg.removeAttribute('data-offscreen');qa.animator.draw()`);
    window.setSize(460,700);await wait(400);
    await run(`qa.lastSvg=[...document.querySelectorAll('.application-city')].at(-1);qa.lastPainter=qa.animator.canvases.get(qa.lastSvg);void 0;`);await wait(2300);
    assert.equal(await run(`qa.lastSvg.hasAttribute('data-offscreen')`),true);
    await run(`qa.lastSvg.scrollIntoView({block:'center'})`);await wait(500);
    assert.ok(await run(`(()=>{const p=qa.lastPainter,data=p.ctx.getImageData(0,0,p.canvas.width,p.canvas.height).data;return !qa.lastSvg.hasAttribute('data-offscreen')&&p===qa.animator.canvases.get(qa.lastSvg)&&data.some((v,i)=>i%4===3&&v>20);})()`),'Offscreen city paints again after polls and scrolling');
    await capture('scrolled');window.setSize(1400,1100);
    const stages=[];
    for(let stage=0;stage<20;stage++){
      await run(`livingPreview.setStages([${stage}]);scrollTo(0,0);void 0;`);await wait(250);
      await run(`Promise.all([...document.querySelectorAll('.application-city image')].map(el=>{const i=new Image();i.src=el.getAttribute('href');return i.decode();}))`);
      const check=await run(`(()=>{const p=qa.animator.canvases.get(document.querySelector('.application-city'));qa.animator.draw();const data=p.ctx.getImageData(0,0,p.canvas.width,p.canvas.height).data;let painted=0;for(let i=3;i<data.length;i+=4)if(data[i]>20)painted++;return {painted,samePainter:p===qa.painter,time:p.time};})()`);
      assert.ok(check.painted>10000,'Stage '+stage+' paints its original artwork');assert.ok(check.samePainter,'Tier change retains the painter');stages.push({stage,...check});
      const backdrop=await run(`(async()=>{const {worldBackground}=await import('/world.js'),p=qa.painter,node=qa.svg.querySelector('.world-backdrop'),cache=p.nodes.get(node).cache;const pixels=cache.bitmap.getContext('2d').getImageData(0,0,cache.bitmap.width,Math.floor(cache.bitmap.height*.45)).data;let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>240)painted++;qa.animator.draw();return {source:qa.svg.querySelector('.world-panorama').getAttribute('href')===worldBackground(${stage}),painted,retained:p.nodes.get(node).cache===cache};})()`);
      assert.ok(backdrop.source,'Measured tier selects the background');assert.ok(backdrop.painted>10000,'Distant scenery paints the previously empty sky');assert.ok(backdrop.retained,'Scenery reuses its raster cache across animation frames');
      if([0,5,10,14,19].includes(stage))await capture('tier-'+stage);
    }
    assert.deepEqual(errors,[]);await writeFile(resolve(output,'results.json'),JSON.stringify({results,continuity,traffic,growth,idle,idleAfter,stages,errors},null,2));
    console.log('CANVAS_RENDERER_OK');
  }finally{window.destroy();server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

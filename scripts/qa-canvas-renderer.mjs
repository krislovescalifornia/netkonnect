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
      if([0,5,10,14,19].includes(stage))await capture('tier-'+stage);
    }
    assert.deepEqual(errors,[]);await writeFile(resolve(output,'results.json'),JSON.stringify({results,continuity,growth,idle,idleAfter,stages,errors},null,2));
    console.log('CANVAS_RENDERER_OK');
  }finally{window.destroy();server.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

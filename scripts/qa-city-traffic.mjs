// Rendered scale, work-yard depth and per-frame delivery continuity.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createLivingCityPreview} from './preview-living-city.mjs';
const output=resolve('test-results/city-traffic');
app.setPath('userData',resolve('test-results/city-traffic-profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const server=createLivingCityPreview();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1400,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  const run=code=>window.webContents.executeJavaScript(code);
  const capture=async name=>writeFile(resolve(output,name),(await window.webContents.capturePage()).toPNG());
  const change=type=>run(`(()=>{const el=document.querySelector('#fleet');el.value=${JSON.stringify(type)};el.dispatchEvent(new Event('change'));})()`);
  const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/living-preview`);
    await run(`Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async path=>{const img=new Image();img.src=path;await img.decode();}))`);
    await wait(800);
    const sizes=[];
    for(const [name,width,height] of [['desktop',1400,1100],['compact',820,1200],['mobile',460,1400]]) {
      window.setSize(width,height);await wait(500);
      const report=await run(`(async()=>{
        const svgs=[...document.querySelectorAll('.application-city')],svg=svgs.find(s=>s.dataset.downloadType==='semi');
        // SVG bounding boxes include the hidden stride atlas. Measure its painted
        // viewport, so cropped poses cannot inflate the apparent person height.
        const h=el=>el.matches('.resident-person')?el.height.baseVal.value*Math.abs(el.parentElement.getScreenCTM().d):el.getBoundingClientRect().height,person=h(svg.querySelector('.resident-person'));
        const semi=svg.querySelector('.transport-vehicle[data-transport="semi"] .supply-semi>image');
        const yards=[...svg.querySelectorAll('.construction-yard')],machines=[...svg.querySelectorAll('.construction-yard .site-vehicle')];
        const start=machines.map(el=>el.getBoundingClientRect());
        const {WORLD_ROUTE_BASELINES}=await import('/world.js');
        const roadTop=new DOMPoint(0,WORLD_ROUTE_BASELINES.road.download-14).matrixTransform(svg.getScreenCTM()).y;
        let maxJump=0,frames=0,last=new Map(),violations=0;const frameTimes=[];
        const began=performance.now();let lastFrame=began;
        await new Promise(resolve=>{function sample(now){
          frames++;frameTimes.push(now-lastFrame);lastFrame=now;
          for(const scene of svgs)for(const vehicle of scene.querySelectorAll('.transport-vehicle')) {
            const m=vehicle.transform.baseVal.consolidate().matrix,p=new DOMPoint(m.e,m.f).matrixTransform(scene.getScreenCTM()),prior=last.get(vehicle);
            if(prior)maxJump=Math.max(maxJump,Math.hypot(p.x-prior.x,p.y-prior.y));last.set(vehicle,p);
          }
          for(const el of svg.querySelectorAll('.resident-person,.construction-yard .site-vehicle,.city-helpers .illustrated-person')) {
            const bottom=el.matches('.resident-person')?new DOMPoint(0,0).matrixTransform(el.parentElement.getScreenCTM()).y:el.getBoundingClientRect().bottom;
            if(bottom>roadTop)violations++;
          }
          if(now-began<2300)requestAnimationFrame(sample);else resolve();
        }requestAnimationFrame(sample);});
        const depthMoves=machines.map((el,i)=>{const r=el.getBoundingClientRect();return {x:Math.abs(r.x-start[i].x),y:Math.abs(r.y-start[i].y)};});
        return {name:${JSON.stringify(name)},person,semiHeight:h(semi),machineRatios:yards.map(yard=>h(yard.querySelector('.illustrated-site-machine image'))/h(yard.querySelector('.worksite-hauler .illustrated-person'))),depths:[...new Set(yards.map(el=>el.dataset.cityY))],depthMoves,roadViolations:violations,frames,maxFrameJumpPixels:maxJump,p95FrameMs:frameTimes.sort((a,b)=>a-b)[Math.floor(frameTimes.length*.95)],labels:[...svg.parentElement.querySelectorAll('.route-speeds>span')].map(el=>({text:el.textContent,color:getComputedStyle(el).color}))};
      })()`);
      console.log('TRAFFIC_SIZE '+JSON.stringify(report));
      assert.ok(report.semiHeight>report.person*1.8,`${name}: semi is proportionally taller than residents`);
      assert.ok(report.machineRatios.every(r=>r>1.5),`${name}: work machinery is larger than workers`);
      assert.equal(report.depths.length,3);assert.ok(report.depthMoves.some(m=>m.y>2),`${name}: machines move into and out of sites`);
      assert.equal(report.roadViolations,0,`${name}: construction and pedestrians stay off the data road`);
      assert.ok(report.frames>45,`${name}: rendered traffic keeps moving between polls`);
      assert.ok(report.maxFrameJumpPixels<15,`${name}: no frame teleports across the scene`);
      assert.ok(report.labels.every(l=>l.color==='rgb(255, 255, 255)'&&/^(Down|Up)\d+\.\d Mbit\/s$/.test(l.text)));
      sizes.push(report);await capture(`${name}.png`);
    }
    window.setSize(1400,1100);await change('handcart');await wait(12500);
    const cart=await run(`(()=>{const el=document.querySelector('.transport-vehicle[data-transport="handcart"]');return {person:el.querySelector('.cart-handler image').getBoundingClientRect().height,cart:el.querySelector('.supply-pushcart>image').getBoundingClientRect().height};})()`);
    assert.ok(cart.person>cart.cart*1.15,'Cart handlers are taller than their carts');await capture('handcarts.png');
    const delivery=await run(`(async()=>{
      // Pick a fresh departure and follow the same DOM node through six polls.
      let el;while(!el){el=[...document.querySelectorAll('.incoming-fleet[data-transport="handcart"]')].find(el=>+el.dataset.progress<.05);if(!el)await new Promise(r=>setTimeout(r,40));}
      const id=el.dataset.journeyId,phases=[],start=performance.now();let previous=null,maxJump=0,bayFrames=0,cargoFaded=false;
      await new Promise(resolve=>{function sample(){
        if(!el.isConnected){resolve();return;}
        const p=+el.dataset.progress,m=el.transform.baseVal.consolidate().matrix;
        if(previous)maxJump=Math.max(maxJump,Math.hypot(m.e-previous.x,m.f-previous.y));previous={x:m.e,y:m.f};
        if(p>.63&&p<.77)bayFrames++;
        if(p>.74&&+getComputedStyle(el.querySelector('.vehicle-cargo')).opacity===0)cargoFaded=true;
        for(const [name,threshold] of [['approach',.45],['unload',.7],['depart',.86]])if(p>=threshold&&!phases.some(s=>s.name===name))phases.push({name,progress:p,x:m.e,y:m.f,parcel:+getComputedStyle(el.querySelector('.delivery-parcel')).opacity});
        if(performance.now()-start>20000){resolve();return;}requestAnimationFrame(sample);
      }requestAnimationFrame(sample);});
      return {id,phases,maxJump,bayFrames,cargoFaded,finished:!el.isConnected};
    })()`);
    assert.ok(delivery.finished);assert.ok(delivery.cargoFaded);assert.ok(delivery.bayFrames>10);assert.equal(delivery.phases.length,3);
    assert.ok(delivery.phases[2].x>delivery.phases[1].x);assert.equal(delivery.phases[2].parcel,1);assert.ok(delivery.maxJump<24);
    await run(`document.querySelector('#motion').click()`);await wait(150);
    const positions=()=>run(`[...document.querySelectorAll('.transport-vehicle')].map(el=>[el.dataset.journeyId,el.getAttribute('transform')])`);
    const paused=await positions();await wait(700);assert.deepEqual(await positions(),paused,'Pause freezes data traffic');
    await run(`document.querySelector('#motion').click()`);
    window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(300);
    const reduced=await positions();await wait(700);assert.deepEqual(await positions(),reduced,'Reduced motion freezes data traffic');
    assert.deepEqual(errors,[]);const report={sizes,cart,delivery,errors};
    await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));console.log('CITY_TRAFFIC_VERIFIED '+JSON.stringify(report));
  }finally{window.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

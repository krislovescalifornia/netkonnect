// Run: electron scripts/qa-city-vibrancy.mjs
// Checks rendered motion across the city, stable timelines, measured growth,
// night illumination, paused/motion-disabled scenes and reduced motion.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createLivingCityPreview} from './preview-living-city.mjs';
const output=resolve('test-results/city-vibrancy');
app.setPath('userData',resolve('test-results/city-vibrancy-profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const motionSelectors=['.resident-walk','.crane-load','.site-vehicle','.crew-builder .illustrated-person','.worksite-hauler .crew-walker'];
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const server=createLivingCityPreview();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1400,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  const run=code=>window.webContents.executeJavaScript(code);
  const errors=[];
  window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const change=(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));})()`);
  const positions=()=>run(`(()=>{const svg=document.querySelector('.application-city');return ${JSON.stringify(motionSelectors)}.map(selector=>({selector,items:[...svg.querySelectorAll(selector)].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,transform:getComputedStyle(el).transform};})}));})()`);
  const motion=async()=>{
    const before=await positions();await wait(1400);const after=await positions();
    return before.map((group,i)=>({selector:group.selector,moved:group.items.filter((item,j)=>item.transform!==after[i].items[j].transform).length,maxPixels:Math.max(0,...group.items.map((item,j)=>Math.hypot(item.x-after[i].items[j].x,item.y-after[i].items[j].y)))}));
  };
  const capture=async name=>writeFile(resolve(output,name),(await window.webContents.capturePage()).toPNG());
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/living-preview`);
    await run(`Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async path=>{const image=new Image();image.src=path;await image.decode();}))`);
    await change('#lighting','21');
    await wait(13000);
    // Save references before polls, growth and responsive layout changes.
    await run(`window.vibrancyProbe={svg:document.querySelector('.application-city'),nodes:[...document.querySelectorAll('.application-city')].flatMap(svg=>${JSON.stringify(motionSelectors)}.flatMap(selector=>[...svg.querySelectorAll(selector)])),growth:[...document.querySelectorAll('.city-project')].map(el=>el.dataset.buildProgress)};window.vibrancyProbe.animations=window.vibrancyProbe.nodes.map(el=>el.getAnimations()[0]);`);
    await run(`document.querySelector('#sort').click();document.querySelector('#sort').click()`);
    const sizes=[];
    for(const [name,width,height] of [['desktop',1400,1100],['compact',820,1200],['mobile',460,1400]]) {
      window.setSize(width,height);await wait(700);
      await capture(`night-${name}-a.png`);
      const movement=await motion();
      await capture(`night-${name}-b.png`);
      assert.ok(movement.every(group=>group.moved>0),`${name}: every activity type must visibly change pose`);
      assert.ok(movement.find(group=>group.selector==='.crane-load').maxPixels>3,`${name}: crane lifts must be perceptible`);
      assert.ok(movement.find(group=>group.selector==='.site-vehicle').maxPixels>3,`${name}: machines must visibly move`);
      const pixels=await run(`(()=>{const svg=document.querySelector('.application-city'),r=svg.getBoundingClientRect();const scale=r.height/280;return {x:Math.round(r.x),y:Math.round(r.y+140*scale),width:Math.floor(r.width),height:Math.ceil(85*scale)};})()`);
      // Hide traffic/clouds briefly so pixel changes establish street/construction
      // activity, rather than merely detecting passing vehicles or sky motion.
      await run(`window.pixelProbeStyle=document.createElement('style');pixelProbeStyle.textContent='.transport-vehicle,.world-cloud,.world-birds{visibility:hidden!important}';document.head.append(pixelProbeStyle);`);
      const a=(await window.webContents.capturePage(pixels)).toBitmap();await wait(1000);
      const b=(await window.webContents.capturePage(pixels)).toBitmap();
      await run('pixelProbeStyle.remove()');
      const quartiles=[0,0,0,0];
      for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>40)quartiles[Math.min(3,Math.floor((i/4%pixels.width)/pixels.width*4))]++;
      assert.ok(quartiles.filter(n=>n>20).length>=3,`${name}: painted activity must move across at least three city quarters`);
      sizes.push({name,width,movement,changedPixelsByQuarter:quartiles});
    }
    const lighting=await run(`(()=>{const svg=document.querySelector('.application-city');return {night:svg.dataset.time,windows:+getComputedStyle(svg.querySelector('.settlement-lights')).opacity,lamps:+getComputedStyle(svg.querySelector('.world-night-lights')).opacity,headlights:document.querySelectorAll('.vehicle-lights').length,crewHeight:svg.querySelector('.worksite-hauler .illustrated-person').getBoundingClientRect().height};})()`);
    assert.equal(lighting.windows,1);assert.equal(lighting.lamps,1);assert.ok(lighting.crewHeight>6,'Compact workers remain perceptible at the shared person scale');
    await change('#growth','75');await wait(1700);await capture('measured-growth.png');
    const growth=await run(`(()=>{const p=window.vibrancyProbe;return {advanced:[...document.querySelectorAll('.city-project')].every((el,i)=>+el.dataset.buildProgress>+p.growth[i]),sameNodes:p.nodes.every(el=>el.isConnected),sameAnimations:p.nodes.every((el,i)=>el.getAnimations()[0]===p.animations[i]),sameOrder:document.querySelector('.application-city')===p.svg,phase:document.querySelector('.application-city').dataset.buildPhase};})()`);
    assert.equal(growth.advanced,true);assert.equal(growth.sameNodes,true);assert.equal(growth.sameAnimations,true);assert.equal(growth.sameOrder,true);
    await run(`document.querySelector('#motion').click()`);await wait(400);
    const paused=await motion();assert.ok(paused.every(group=>group.moved===0),'Pause freezes every work/street animation');
    await run(`document.querySelector('#motion').click();document.querySelector('#gallery').classList.add('no-motion')`);await wait(400);
    const disabled=await motion();assert.ok(disabled.every(group=>group.moved===0),'Motion setting freezes every animation');
    await run(`document.querySelector('#gallery').classList.remove('no-motion')`);
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(400);
    const reduced=await motion();assert.ok(reduced.every(group=>group.moved===0),'Reduced motion freezes every animation');
    await capture('reduced-motion.png');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await change('#lighting','12');await wait(13000);await capture('day-mobile.png');
    const day=await run(`(()=>{const svg=document.querySelector('.application-city');return {windows:getComputedStyle(svg.querySelector('.settlement-lights')).opacity,lamps:getComputedStyle(svg.querySelector('.world-night-lights')).opacity};})()`);
    assert.equal(day.windows,'0');assert.equal(day.lamps,'0');
    await run(`document.querySelector('#traffic').click()`);await wait(26000);
    const resting=await motion();
    assert.ok(resting.find(group=>group.selector==='.resident-walk').moved>0,'Residents stay active without incoming data');
    assert.ok(resting.filter(group=>group.selector!=='.resident-walk').every(group=>group.moved===0),'Construction waits for incoming data');
    const idleGrowth=await run(`[...document.querySelectorAll('.city-project')].map(el=>el.dataset.buildProgress)`);await wait(2100);
    assert.deepEqual(await run(`[...document.querySelectorAll('.city-project')].map(el=>el.dataset.buildProgress)`),idleGrowth,'Polls do not manufacture growth');
    window.setSize(460,700);await run('scrollTo(0,0)');await wait(700);
    const offscreen=await run(`(()=>{const svg=[...document.querySelectorAll('.application-city')].at(-1);window.offscreenProbe={svg,node:svg.querySelector('.resident-walk')};offscreenProbe.animation=offscreenProbe.node.getAnimations()[0];offscreenProbe.time=offscreenProbe.animation.currentTime;return svg.hasAttribute('data-offscreen');})()`);
    assert.equal(offscreen,true,'Cities outside the viewport skip painting');
    await wait(1000);await run('offscreenProbe.svg.scrollIntoView({block:"center"})');await wait(700);
    const restored=await run(`(()=>{const p=offscreenProbe;return {visible:!p.svg.hasAttribute('data-offscreen'),sameAnimation:p.node.getAnimations()[0]===p.animation,continued:p.animation.currentTime>p.time+1000};})()`);
    assert.equal(restored.visible,true);assert.equal(restored.sameAnimation,true);assert.equal(restored.continued,true);
    await capture('scrolled-city.png');
    assert.deepEqual(errors,[]);
    const report={sizes,lighting,growth,paused,disabled,reduced,resting,offscreen,restored,errors};
    await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));
    console.log('CITY_VIBRANCY_VERIFIED '+JSON.stringify(report));
  }finally{window.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

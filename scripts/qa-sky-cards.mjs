import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createLivingCityPreview} from './preview-living-city.mjs';
const output=resolve('test-results/sky-cards');
app.setPath('userData',resolve('test-results/sky-cards-profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});const server=createLivingCityPreview();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1400,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  const run=code=>window.webContents.executeJavaScript(code),capture=async name=>writeFile(resolve(output,name),(await window.webContents.capturePage()).toPNG());
  const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const positions=()=>run(`[...document.querySelectorAll('.application-city')][0].querySelectorAll('.sky-visitor').values().map(el=>({kind:el.dataset.skyKind,x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,opacity:+getComputedStyle(el).opacity})).toArray()`);
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/living-preview`);
    await run(`Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async src=>{const image=new Image();image.src=src;await image.decode();}))`);
    assert.equal(await run("[...document.querySelectorAll('.sky-visitor')].filter(el=>+getComputedStyle(el).opacity>0).length"),0,'Startup sky stays quiet');
    await run(`window.skyProbe=[...document.querySelectorAll('.sky-visitor')];window.skyAnimations=skyProbe.map(el=>el.querySelector('.sky-bob').getAnimations()[0]);window.showSky=kind=>{const a=livingPreview.animator,svg=document.querySelector('.application-city'),sky=a.skyScenes.get(svg);sky.nextAt=a.queue.now;sky.sample(a.queue.now);sky.event.kind=kind;sky.event.start=a.queue.now-sky.event.duration*.35;a.draw();};void 0;`);
    const motion=[];
    for(const kind of ['birds','kite','drone','ufo']) {
      await run('showSky('+JSON.stringify(kind)+')');await wait(100);
      const before=await positions();await wait(1400);const after=await positions();
      const i=before.findIndex(p=>p.kind===kind),entry={kind,pixels:Math.hypot(before[i].x-after[i].x,before[i].y-after[i].y),visible:before[i].opacity>.5&&after[i].opacity>.5};
      assert.ok(entry.visible&&entry.pixels>5,JSON.stringify(entry));assert.equal(after.filter(p=>p.opacity>.01).length,1);motion.push(entry);await capture('sighting-'+kind+'.png');
    }
    await run(`document.querySelector('[data-map-expand]').click()`);await wait(200);
    const sizes=[];
    for(const [name,width,height] of [['desktop',1400,1100],['compact',820,1200],['mobile',460,1200]]) {
      window.setSize(width,height);await wait(450);
      const layout=await run(`(()=>{
        const cards=[...document.querySelectorAll('.application-city-card')];
        return {name:${JSON.stringify(name)},overflow:document.documentElement.scrollWidth>innerWidth,items:cards.map(c=>{
          const scene=c.querySelector('.application-city').getBoundingClientRect(),detail=c.querySelector('.city-detail-card').getBoundingClientRect(),heading=c.querySelector('.city-app-heading').getBoundingClientRect(),footer=c.querySelector('.city-detail-footer').getBoundingClientRect(),info=c.querySelector('.city-services').getBoundingClientRect(),graphs=c.querySelector('.city-usage-graphs');
          const identity=c.querySelector('.city-app-heading'),badge=identity.querySelector('.origin-mark'),bar=c.querySelector('.city-progress'),labels=c.querySelector('.city-progress-labels'),bounds=labels.getBoundingClientRect();return {clearIdentity:getComputedStyle(identity).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(badge).backgroundColor==='rgba(0, 0, 0, 0)',width:scene.width,fullWidth:Math.abs(scene.width-detail.width+2)<2,overlay:heading.left>scene.left&&heading.top>scene.top&&heading.bottom<scene.bottom,oneFooter:footer.height<70,infoLeft:info.left-detail.left<16,growth:bar.getAttribute('aria-valuenow')==='35'&&bar.getBoundingClientRect().height>=5&&bounds.left>=footer.left&&bounds.right<=footer.right&&labels.textContent.includes('Start')&&labels.textContent.includes('Finish')&&labels.textContent.includes('to go'),simpleFooter:!c.querySelector('.city-infrastructure,.city-world-clock'),graphs:graphs?graphs.querySelectorAll('.usage-graph').length:0,graphsBelow:!graphs||graphs.getBoundingClientRect().top>=info.bottom};
        })};})()`);
      assert.equal(layout.overflow,false);assert.ok(layout.items.every(c=>c.clearIdentity&&c.fullWidth&&c.overlay&&c.oneFooter&&c.infoLeft&&c.growth&&c.simpleFooter&&c.graphsBelow),JSON.stringify(layout));assert.equal(layout.items.reduce((n,c)=>n+c.graphs,0),3);
      sizes.push(layout);await capture(`${name}.png`);
    }
    await run(`document.querySelector('#sort').click();document.querySelector('#sort').click();const growth=document.querySelector('#growth');growth.value='75';growth.dispatchEvent(new Event('input'));`);await wait(2200);
    assert.equal(await run(`[...document.querySelectorAll('.city-progress')].every(bar=>bar.getAttribute('aria-valuenow')==='75'&&bar.firstElementChild.style.width==='75%')`),true,'Measured growth updates the visible progress bars');
    const preserved=await run(`skyProbe.every((el,i)=>el.isConnected&&el.querySelector('.sky-bob').getAnimations()[0]===skyAnimations[i])`);assert.equal(preserved,true);
    await run(`document.querySelector('#motion').click()`);await wait(200);const pausedBefore=await positions();await wait(900);assert.deepEqual(await positions(),pausedBefore);
    await run(`document.querySelector('#motion').click();document.querySelector('#gallery').classList.add('no-motion')`);await wait(100);const disabledBefore=await positions();await wait(700);assert.deepEqual(await positions(),disabledBefore);
    await run(`document.querySelector('#gallery').classList.remove('no-motion');const light=document.querySelector('#lighting');light.value='21';light.dispatchEvent(new Event('change'));`);window.setSize(1400,1100);await wait(13000);
    const night=await run(`(()=>{const svg=document.querySelector('.application-city');return {stars:+getComputedStyle(svg.querySelector('.world-stars')).opacity,count:svg.querySelectorAll('.sky-star').length,birds:getComputedStyle(svg.querySelector('.world-birds')).visibility,kite:getComputedStyle(svg.querySelector('.world-kite')).visibility};})()`);assert.equal(night.stars,1);assert.equal(night.count,40);assert.equal(night.birds,'hidden');assert.equal(night.kite,'hidden');await capture('night.png');
    window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(200);
    const reduced=await run(`[...document.querySelectorAll('.sky-visitor,.sky-star')].every(el=>getComputedStyle(el).animationName==='none')`);assert.equal(reduced,true);
    assert.deepEqual(errors,[]);const report={motion,sizes,preserved,night,reduced,errors};await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));console.log('SKY_CARDS_VERIFIED '+JSON.stringify(report));
  }finally{window.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

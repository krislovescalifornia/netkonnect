// Verify a moving crane's cable stays connected and upload silhouettes cross
// both viewport edges before appearing/disappearing, through live refreshes.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createLivingCityPreview} from './preview-living-city.mjs';
const output=resolve('test-results/crane-uploads');
app.setPath('userData',resolve('test-results/crane-uploads-profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});const server=createLivingCityPreview();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1400,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  const run=code=>window.webContents.executeJavaScript(code),capture=async name=>writeFile(resolve(output,name),(await window.webContents.capturePage()).toPNG());
  const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/living-preview`);
    await run(`Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async src=>{const image=new Image();image.src=src;await image.decode();}))`);
    const sizes=[];
    for(const [name,width,height] of [['desktop',1400,1100],['compact',820,1200]]) {
      window.setSize(width,height);await wait(600);
      const report=await run(`(async()=>{
        const svg=document.querySelector('.application-city'),cranes=[...svg.querySelectorAll('.site-crane')];
        const first=cranes.map(el=>new DOMPoint(0,0).matrixTransform(el.querySelector('.crane-load').getScreenCTM()).y);
        const animations=cranes.map(el=>el.querySelector('.crane-load').getAnimations().find(a=>a.animationName==='city-hoist'));
        const before=animations.map(a=>({name:a?.animationName,time:a?.currentTime}));
        let maxGap=0,paintedFrames=0;const began=performance.now();
        await new Promise(resolve=>{function sample(now){
          paintedFrames++;
          for(const crane of cranes){
            const cable=crane.querySelector('.crane-cable'),load=crane.querySelector('.crane-load'),anchor=crane.querySelector('.crane-hoist-anchor');
            const top=new DOMPoint(0,0).matrixTransform(cable.getScreenCTM()),fixed=new DOMPoint(0,0).matrixTransform(anchor.getScreenCTM());
            const bottom=new DOMPoint(0,1).matrixTransform(cable.getScreenCTM()),hook=new DOMPoint(0,0).matrixTransform(load.getScreenCTM());
            maxGap=Math.max(maxGap,Math.hypot(top.x-fixed.x,top.y-fixed.y),Math.hypot(bottom.x-hook.x,bottom.y-hook.y));
          }
          if(now-began<2600)requestAnimationFrame(sample);else resolve();
        }requestAnimationFrame(sample);});
        const movement=cranes.map((el,i)=>Math.abs(new DOMPoint(0,0).matrixTransform(el.querySelector('.crane-load').getScreenCTM()).y-first[i]));
        return {name:${JSON.stringify(name)},maxGap,paintedFrames,movement,before,after:cranes.map(el=>el.querySelector('.crane-load').getAnimations().map(a=>({name:a.animationName,time:a.currentTime}))),connected:cranes.every(el=>el.isConnected),sameTimelines:cranes.every((el,i)=>el.querySelector('.crane-load').getAnimations().find(a=>a.animationName==='city-hoist')===animations[i])};
      })()`);
      console.log('CRANE_RIG '+JSON.stringify(report));
      assert.ok(report.maxGap<.1,'Cable stays attached at boom and moving hook');assert.ok(Math.max(...report.movement)>3);assert.ok(report.sameTimelines);assert.ok(report.paintedFrames>60);
      sizes.push(report);await capture(`${name}.png`);
    }
    window.setSize(1400,1100);await run(`(()=>{const el=document.querySelector('#fleet');el.value='semi';el.dispatchEvent(new Event('change'));})()`);await wait(4500);
    const upload=await run(`(async()=>{
      let node;const waiting=performance.now();
      while(!node&&performance.now()-waiting<5000){node=[...document.querySelectorAll('.outgoing-fleet[data-transport="semi"]')].find(el=>+el.dataset.progress<.003);if(!node)await new Promise(r=>setTimeout(r,8));}
      if(!node)throw new Error('No fresh upload');
      const svg=node.closest('svg'),bounds=svg.getBoundingClientRect(),start=node.getBoundingClientRect(),id=node.dataset.journeyId;
      const leftPositions=[],samples=[];let lastBox=start,lastProgress=0,lastX=0,monotonic=true,previous=Infinity;const began=performance.now();
      await new Promise(resolve=>{function sample(){
        if(!node.isConnected||performance.now()-began>20000){resolve();return;}
        const rect=node.getBoundingClientRect(),progress=+node.dataset.progress;
        if(rect.x>previous+.1)monotonic=false;previous=rect.x;lastBox=rect;lastProgress=progress;lastX=node.transform.baseVal.consolidate().matrix.e;
        if(progress>.99)leftPositions.push(rect.right);
        for(const threshold of [.25,.5,.75,.99])if(progress>=threshold&&!samples.some(s=>s.threshold===threshold))samples.push({threshold,progress,left:rect.left,right:rect.right});
        requestAnimationFrame(sample);
      }requestAnimationFrame(sample);});
      return {id,startLeft:start.left,sceneRight:bounds.right,finishRight:lastBox.right,sceneLeft:bounds.left,lastProgress,lastX,currentScene:svg.getBoundingClientRect().toJSON(),viewBox:svg.getAttribute('viewBox'),matrix:{a:svg.getScreenCTM().a,e:svg.getScreenCTM().e},leftPositions,monotonic,samples,removed:!node.isConnected};
    })()`);
    console.log('UPLOAD_EDGE '+JSON.stringify(upload));
    assert.ok(upload.startLeft>upload.sceneRight,'Entire upload enters from offscreen right');assert.ok(upload.finishRight<upload.sceneLeft,'Entire upload exits offscreen left before removal');
    assert.ok(upload.leftPositions.every(x=>x<upload.sceneLeft));assert.ok(upload.monotonic);assert.ok(upload.removed);assert.equal(upload.samples.length,4);
    await capture('upload-flow.png');
    // Enlarged live rig review preserves the same illustrated mast/boom pixels.
    await run(`(()=>{const source=document.querySelector('.site-crane'),rig=source.cloneNode(true),review=document.createElementNS('http://www.w3.org/2000/svg','svg');rig.setAttribute('transform','translate(50 0)');review.setAttribute('viewBox','0 55 100 80');review.setAttribute('class','application-city city-working');review.style.cssText='width:600px;height:480px;background:#f4f5eb;display:block;margin:24px auto';review.append(rig);document.body.prepend(review);scrollTo(0,0);})()`);await wait(400);await capture('rig-closeup.png');
    assert.deepEqual(errors,[]);const report={sizes,upload,errors};await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));console.log('CRANE_UPLOADS_VERIFIED '+JSON.stringify(report));
  }finally{window.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

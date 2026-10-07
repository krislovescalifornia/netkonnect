// Verify real unit changes keep the application speed column inside the card.
import {app,BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createAppServer} from '../lib/http.mjs';
import {demoSnapshot} from '../public/demo.js';
import {speedUnits} from '../public/speed.js';

app.setPath('userData',resolve('test-results/speed-layout-profile'));
app.whenReady().then(async()=>{
  const snapshot=demoSnapshot();
  snapshot.connections=snapshot.connections.filter(c=>c.app==='Code');
  for(const connection of snapshot.connections) {
    connection.receiveRate=123456789;
    connection.sendRate=98765432;
  }
  const server=createAppServer({getSnapshot:()=>({snapshot,interval:2000,collecting:false,error:null}),getAnalytics:()=>({}),requestRestart:()=>({})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}`);
    await new Promise(resolve=>setTimeout(resolve,500));
    const results=[];
    for(const width of [1440,1100,901,900,760,520,390]) {
      window.setSize(width,1000);
      await new Promise(resolve=>setTimeout(resolve,100));
      let fixedRight;
      for(let i=0;i<speedUnits.length;i++) {
        const bounds=await window.webContents.executeJavaScript(`(()=>{
          const card=document.querySelector('.application-city-card');
          const road=card.querySelector('.route-road').getBoundingClientRect();
          const speeds=card.querySelector('.route-speeds').getBoundingClientRect();
          const scene=card.querySelector('.convoy-svg').getBoundingClientRect();
          const buttons=[...card.querySelectorAll('.speed-value')].map(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,text:el.textContent};});
          return {roadRight:road.right,speedLeft:speeds.left,speedRight:speeds.right,sceneRight:scene.right,buttons,overflow:document.documentElement.scrollWidth>innerWidth};
        })()`);
        fixedRight??=bounds.speedRight;
        assert.ok(Math.abs(bounds.speedRight-fixedRight)<1,`right edge moved at ${width}px: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.buttons.every(b=>Math.abs(b.right-fixedRight)<1&&b.right<=bounds.roadRight+1),`speed overflow or moving right edge at ${width}px: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.sceneRight<=bounds.speedLeft+1,`road overlaps speed column at ${width}px: ${JSON.stringify(bounds)}`);
        assert.equal(bounds.overflow,false,`page overflow at ${width}px`);
        results.push({width,...bounds});
        await window.webContents.executeJavaScript(`document.querySelector('.application-city-card .speed-value').click()`);
      }
    }
    await mkdir(resolve('test-results/speed-layout'),{recursive:true});
    window.setSize(1440,1000);
    await window.webContents.executeJavaScript(`(()=>{for(let i=0;i<${speedUnits.length};i++){const b=document.querySelector('.application-city-card .speed-value');if(b.textContent.includes(' B/s'))break;b.click();}})()`);
    await new Promise(resolve=>setTimeout(resolve,100));
    await writeFile(resolve('test-results/speed-layout/desktop.png'),(await window.webContents.capturePage()).toPNG());
    window.setSize(390,1000);
    await window.webContents.executeJavaScript(`document.querySelector('.application-city-card').scrollIntoView({block:'center'})`);
    await new Promise(resolve=>setTimeout(resolve,100));
    await writeFile(resolve('test-results/speed-layout/narrow.png'),(await window.webContents.capturePage()).toPNG());
    await writeFile(resolve('test-results/speed-layout/results.json'),JSON.stringify(results,null,2));
    console.log(`SPEED_LAYOUT_VERIFIED ${results.length} layouts across all ${speedUnits.length} units`);
  } finally {window.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

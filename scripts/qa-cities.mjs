// Render the shipped UI with illustrative traffic, without starting collectors.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';
import {demoSnapshot} from '../public/demo.js';
app.setPath('userData',resolve('test-results/city-preview-profile'));
app.whenReady().then(async()=>{
const errors=[];
const snapshot=()=>{
  const s=demoSnapshot(),ips=['142.250.80.46','13.107.42.12','140.82.112.4'];
  s.connections=s.connections.filter(c=>ips.includes(c.remoteAddress));
  return {snapshot:s,interval:2000,collecting:false,error:null};
};
const server=createAppServer({getSnapshot:snapshot,getAnalytics:()=>({}),requestRestart:()=>({})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const window=new BrowserWindow({show:false,width:1440,height:1340,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
try {
  await window.loadURL(`http://127.0.0.1:${server.address().port}`);
  await new Promise(resolve=>setTimeout(resolve,1800));
  const inspect=()=>window.webContents.executeJavaScript(`(()=>{
    const cities=[...document.querySelectorAll('.service-city')];
    return {count:cities.length,stages:cities.map(c=>Number(c.dataset.stage)),helpers:document.querySelectorAll('.service-city .helper-person').length,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  const initial=await inspect();assert.equal(initial.count,3);assert.deepEqual(initial.stages,[6,4,1]);assert.ok(initial.helpers>=9);
  await window.webContents.executeJavaScript(`window.cityNode=document.querySelector('.service-city');window.convoyNode=document.querySelector('.convoy-svg');`);
  await new Promise(resolve=>setTimeout(resolve,2400));
  assert.equal(await window.webContents.executeJavaScript(`window.cityNode===document.querySelector('.service-city')&&window.convoyNode===document.querySelector('.convoy-svg')`),true,'polling must preserve animation nodes');
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="motion"]').click()`);
  const paused=await window.webContents.executeJavaScript(`(()=>{const a=document.querySelector('.crew-carrier').getAnimations()[0];return {paused:getComputedStyle(document.querySelector('.crew-carrier')).animationPlayState,at:a?.currentTime,progress:document.querySelector('.transport-vehicle')?.dataset.progress};})()`);
  assert.equal(paused.paused,'paused');
  await new Promise(resolve=>setTimeout(resolve,300));
  const frozen=await window.webContents.executeJavaScript(`({at:document.querySelector('.crew-carrier').getAnimations()[0]?.currentTime,progress:document.querySelector('.transport-vehicle')?.dataset.progress})`);
  assert.ok(Math.abs(frozen.at-paused.at)<40);assert.equal(frozen.progress,paused.progress);
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="motion"]').click()`);
  await new Promise(resolve=>setTimeout(resolve,2200));
  await mkdir(resolve('test-results/cities'),{recursive:true});
  await writeFile(resolve('test-results/cities/desktop.png'),(await window.webContents.capturePage()).toPNG());
  window.setSize(760,1160);await new Promise(resolve=>setTimeout(resolve,250));
  const narrow=await inspect();assert.equal(narrow.overflow,false);
  const overlaps=await window.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.service-city-card'),road=card.querySelector('.route-road').getBoundingClientRect(),city=card.querySelector('.route-city').getBoundingClientRect();return road.bottom>city.top;})()`);
  assert.equal(overlaps,false,'city and lanes must not overlap on narrow screens');
  await writeFile(resolve('test-results/cities/narrow.png'),(await window.webContents.capturePage()).toPNG());
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.crew-carrier')).animationName`),'none');
  const reducedProgress=await window.webContents.executeJavaScript(`document.querySelector('.transport-vehicle')?.dataset.progress`);
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.transport-vehicle')?.dataset.progress`),reducedProgress);
  assert.deepEqual(errors,[]);
  await writeFile(resolve('test-results/cities/results.json'),JSON.stringify({initial,narrow,persistentNodes:true,pause:true,reducedMotion:true,errors},null,2));
  console.log('CITY_UI_VERIFIED '+JSON.stringify(initial));
} finally {window.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

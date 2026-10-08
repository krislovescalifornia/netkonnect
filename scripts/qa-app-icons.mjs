import { app,BrowserWindow } from 'electron';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppIcons,windowsIconReader } from '../lib/app-icons.mjs';
import { IconWishlist } from '../lib/icon-wishlist.mjs';
import { createAppServer } from '../lib/http.mjs';
const output=resolve('test-results/app-icon-tiers');
app.setPath('userData',join(output,'profile'));app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const icons=new AppIcons(output,{readIcons:windowsIconReader(resolve('.')),getFileIcon:(path,options)=>app.getFileIcon(path,options)});await icons.load();
  const native=await icons.request({name:'explorer',path:join(process.env.SystemRoot,'explorer.exe'),pid:0,localPath:true});assert.ok(native);
  const now=Date.now(),wishlist=new IconWishlist(join(output,'campaign-'+randomUUID()));await wishlist.load(now-3600000);
  wishlist.add('explorer',10,now-600000,now);wishlist.add('no-icon-worker',11,now-120000,now);await wishlist.flush();
  const names=['firefox','explorer','no-icon-worker','broken-icon-worker'];
  const connections=names.map((app,i)=>({id:'icon-fixture-'+i,app,pid:10+i,scope:'Internet',protocol:'TCP',state:'Established',localAddress:'192.168.1.2',localPort:51000+i,remoteAddress:'203.0.113.'+(10+i),remotePort:443,domainCandidates:i===0?['github.com']:[],firstSeen:new Date(now).toISOString(),receiveRate:0,sendRate:0}));
  const snapshot={timestamp:new Date(now).toISOString(),computer:'Icon QA fixture',issues:[],adapters:[],connections,totals:{ready:true,receiveRate:0,sendRate:0},history:[],appIcons:{...icons.catalog(),'broken-icon-worker':'/app-icons/'+'f'.repeat(64)+'.png'},iconWishlist:wishlist.report(),traffic:{available:true,timestamp:new Date(now).toISOString(),eventsLost:0,usageConnections:[],cityUsage:[]}};
  const server=createAppServer({getSnapshot:()=>({snapshot,collecting:false,interval:2000}),getIcon:id=>icons.read(id)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const window=new BrowserWindow({show:false,width:1440,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
  const evaluate=code=>window.webContents.executeJavaScript(code),screens=[];
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}`);await new Promise(r=>setTimeout(r,350));
    await evaluate(`document.querySelector('[data-page="connections"]').click()`);
    await new Promise(r=>setTimeout(r,250));
    const tiers=await evaluate(`[...document.querySelectorAll('.table-app .brand-badge')].map(b=>b.dataset.iconTier)`);assert.deepEqual(tiers,['watercolor','windows','letter','letter']);
    const nativeImage=await evaluate(`(()=>{const i=document.querySelector('.table-app .os-app-icon');return {ready:i.complete&&i.naturalWidth>0,width:i.naturalWidth,height:i.naturalHeight};})()`);assert.deepEqual(nativeImage,{ready:true,width:64,height:64});
    await writeFile(join(output,'connections.png'),(await window.webContents.capturePage()).toPNG());
    await evaluate(`document.querySelector('[data-action="settings"]').click()`);await new Promise(r=>setTimeout(r,150));
    assert.match(await evaluate(`document.querySelector('#icon-wishlist').textContent`),/Explorer.*10\.0 min/s);
    // Keep the drawer open across a live poll, including failed-image fallback.
    await new Promise(r=>setTimeout(r,2200));
    for(const width of [1440,800,390]) {
      window.setSize(width,1100);await new Promise(r=>setTimeout(r,150));
      const layout=await evaluate(`(()=>{const e=document.querySelector('.watercolor-wishlist');return {overflow:document.documentElement.scrollWidth>innerWidth,listOverflow:e.scrollWidth>e.clientWidth,count:e.querySelectorAll('li').length,badgeWidths:[...e.querySelectorAll('.brand-badge')].map(b=>b.getBoundingClientRect().width),badImages:[...e.querySelectorAll('img')].filter(i=>!i.hidden&&(!i.complete||!i.naturalWidth)).length};})()`);
      assert.equal(layout.overflow,false);assert.equal(layout.listOverflow,false);assert.equal(layout.count,2);assert.equal(layout.badImages,0);assert.deepEqual(layout.badgeWidths,[36,36]);screens.push({width,...layout});
      await writeFile(join(output,'wishlist-'+width+'.png'),(await window.webContents.capturePage()).toPNG());
    }
    await writeFile(join(output,'qa.json'),JSON.stringify({verifiedAt:Date.now(),tiers,nativeImage,screens},null,2));console.log('APP_ICON_TIERS_VERIFIED '+JSON.stringify({tiers,nativeImage,screens}));
  }finally{window.destroy();await new Promise(r=>server.close(r));await icons.close();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

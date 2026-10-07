// Raster reference images for imagegen; the original licensed SVGs stay intact.
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {brands} from '../public/brands.js';
import {createAppServer} from '../lib/http.mjs';

const output=resolve('test-results/watercolor-icons/references');
const logos=[...new Set(Object.values(brands).map(([,logo])=>logo))];
app.setPath('userData',resolve('test-results/icon-reference-profile'));
app.whenReady().then(async()=>{
  await mkdir(output,{recursive:true});
  const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent}.grid{display:grid;grid-template-columns:repeat(4,384px)}.reference{width:384px;height:384px;display:grid;place-items:center}.reference img{width:320px;height:320px;object-fit:contain}</style><div class="grid">${logos.map(id=>`<div class="reference" data-logo="${id}"><img src="/icons/${id}.svg"></div>`).join('')}</div>`;
  const assets=createAppServer({getSnapshot:()=>({})});
  const server=createServer((req,res)=>{if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else assets.emit('request',req,res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const win=new BrowserWindow({show:false,transparent:true,backgroundColor:'#00000000',width:1536,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}`);
    await win.webContents.executeJavaScript(`Promise.all([...document.images].map(i=>i.decode()))`);
    const cells=await win.webContents.executeJavaScript(`[...document.querySelectorAll('.reference')].map(el=>{const b=el.getBoundingClientRect();return {id:el.dataset.logo,x:b.left,y:b.top,width:b.width,height:b.height,scale:1};})`);
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
    for(const {id,...clip} of cells){const capture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});await writeFile(resolve(output,id+'.png'),Buffer.from(capture.data,'base64'));}
    const capture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1536,height:Math.ceil(logos.length/4)*384,scale:1}});
    await writeFile(resolve(output,'contact-sheet.png'),Buffer.from(capture.data,'base64'));
    console.log('Rendered '+logos.length+' original logo references: '+output);
  } finally {win.destroy();await new Promise(r=>server.close(r));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

// Read-only local preview of the real living-city renderer with illustrative data.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createAppServer} from '../lib/http.mjs';
const html=`<!doctype html><meta charset="utf-8"><title>Living city preview</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transport.css"><style>body{display:block;padding:24px;margin:0;background:#f4f5eb;color:#294737;font-family:Segoe UI,sans-serif}main{max-width:1300px;padding:0;margin:auto}h1{margin:0 0 8px;font-size:26px}p{margin:0 0 18px;font-size:13px}.controls{display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-bottom:20px}.controls label{display:flex;gap:8px;align-items:center;font-size:13px}.controls button,.controls select{padding:7px 12px;border:1px solid #bbcdb0;background:#fffdf6;border-radius:5px}.controls input{accent-color:#567a60}.transport-toolbar,.transport-table-head,.transport-foot{display:none}.city-established,.city-rising,.city-project,.construction-phase,.site-scaffolding,.construction-yard{transition-duration:1s}.city-app-card .route-origin{pointer-events:none}</style><main><h1>The living city</h1><p>Illustrative data · Walking residents, active construction, moving deliveries and measured growth</p><div class="controls"><label>Lighting <select id="lighting"><option value="12">Day</option><option value="6">Sunrise</option><option value="18">Dusk</option><option value="21">Night</option></select></label><label>Construction <input id="growth" type="range" min="0" max="99" value="35"><output id="growth-label">35%</output></label><button id="traffic">Stop incoming traffic</button><button id="motion">Pause motion</button><button id="sort">Reverse app order</button></div><div id="gallery"></div></main><script type="module" src="/living-demo.js"></script>`;
const script=`import {renderNetworkMap,TransportAnimator} from '/map.js';
import {CITY_STAGES} from '/cities.js';
import {speedButton} from '/speed.js';
import {updateMarkup} from '/render.js';
const gallery=document.querySelector('#gallery'),names=['firefox','Code','OneDrive',...Array.from({length:17},(_,i)=>'District '+String(i+4).padStart(2,'0'))];
let stages=[5,6,10];
let running=true,paused=false,progress=.35,hour=12,sortDirection='asc',fleet='auto',reducedOverride=null;
const expandedKeys=new Set();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const fleetControl=document.createElement('label');fleetControl.innerHTML='Data Traffic <select id="fleet"><option value="auto">Automatic</option><option value="handcart">Handcart</option><option value="semi">Semi</option><option value="rigid-truck">Heavy truck</option></select>';document.querySelector('.controls').append(fleetControl);
const animator=new TransportAnimator({wallClock:()=>new Date(2026,9,9,hour)});
window.livingPreview={animator,render,setStages(next){stages=next;render();},setReducedMotion(value){reducedOverride=value;render();}};
const stageControl=document.createElement('label');stageControl.innerHTML='Places <select id="places"><option value="priority">Estate / Neighborhood / City</option><option value="all">All 20 levels</option>'+Array.from({length:5},(_,i)=>'<option value="group-'+i+'">Levels '+(i*4+1)+'–'+(i*4+4)+'</option>').join('')+'</select>';document.querySelector('.controls').append(stageControl);
stageControl.querySelector('select').onchange=e=>{const value=e.target.value;stages=value==='all'?Array.from({length:20},(_,i)=>i):value.startsWith('group-')?Array.from({length:4},(_,i)=>Number(value.slice(6))*4+i):[5,6,10];render();};
function render(){
 const connections=stages.map((stage,i)=>({app:names[i],pid:10+i,scope:'Internet',protocol:'TCP',state:'Established',remoteAddress:'1.2.3.'+(i+1),remotePort:443,receiveRate:running?[180000,900000,2300000][i%3]:0,sendRate:running?[20000,70000,900000][i%3]:0,receivedBytes60m:12345678,sentBytes60m:654321}));
 const snapshot={connections,traffic:{available:true,cityUsage:connections.map((c,i)=>({...c,receivedBytesTotal:CITY_STAGES[stages[i]].at+(CITY_STAGES[stages[i]+1]?.at-CITY_STAGES[stages[i]].at||0)*progress,sentBytesTotal:0}))}};
 const state={snapshot,mode:'demo',mapApp:'all',mapQuery:'',mapDetail:'service',mapLimit:25,mapSort:'app',mapSortDirection:sortDirection,mapVehicle:fleet,motion:true,paused,reducedMotion:reducedOverride??reduced.matches,worldDate:new Date(2026,9,9,hour),mapExpanded:expandedKeys};
 const scenes=new Map([...gallery.querySelectorAll('.application-city')].map(svg=>[svg.dataset.cityKey,svg]));
 updateMarkup(gallery,renderNetworkMap({state,scenes,icon:()=>'',rate:n=>speedButton(n,'Mbit/s'),bytes:n=>n==null?'—':n>=1024**3?(n/1024**3).toFixed(1)+' GB':(n/1024**2).toFixed(1)+' MB',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}));
 animator.mount(gallery,{source:'living-preview',active:!paused&&!(reducedOverride??reduced.matches)&&!gallery.classList.contains('no-motion')});
}
document.querySelector('#lighting').onchange=e=>{hour=Number(e.target.value);animator.updateWorldClock();};
document.querySelector('#growth').oninput=e=>{progress=Number(e.target.value)/100;document.querySelector('#growth-label').value=e.target.value+'%';render();};
document.querySelector('#traffic').onclick=e=>{running=!running;e.target.textContent=running?'Stop incoming traffic':'Start incoming traffic';render();};
document.querySelector('#motion').onclick=e=>{paused=!paused;e.target.textContent=paused?'Resume motion':'Pause motion';render();};
document.querySelector('#sort').onclick=()=>{sortDirection=sortDirection==='asc'?'desc':'asc';render();};
document.querySelector('#fleet').onchange=e=>{fleet=e.target.value;render();};
gallery.onclick=e=>{const button=e.target.closest('[data-map-expand]');if(button){const key=button.dataset.mapExpand;expandedKeys.has(key)?expandedKeys.delete(key):expandedKeys.add(key);render();}};
reduced.onchange=render;
render();setInterval(render,2000);
if(location.search.includes('verify'))import('/living-check.js');`;
export function createLivingCityPreview() {
const assets=createAppServer({getSnapshot:()=>({})});
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/living-preview')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
 else if(req.url==='/living-demo.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(script);}
 else if(req.url==='/living-check.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(await readFile(new URL('./living-browser-check.js',import.meta.url)));}
 else assets.emit('request',req,res);
});
return server;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
const server=createLivingCityPreview();
server.listen(0,'127.0.0.1',()=>console.log('LIVING_CITY_PREVIEW http://127.0.0.1:'+server.address().port+'/living-preview'));

}

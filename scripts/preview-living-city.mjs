// Read-only local preview of the real living-city renderer with illustrative data.
import {createServer} from 'node:http';
import {createAppServer} from '../lib/http.mjs';
const html=`<!doctype html><meta charset="utf-8"><title>Living city preview</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transport.css"><style>body{display:block;padding:24px;margin:0;background:#f4f5eb;color:#294737;font-family:Segoe UI,sans-serif}main{max-width:1300px;padding:0;margin:auto}h1{margin:0 0 8px;font-size:26px}p{margin:0 0 18px;font-size:13px}.controls{display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-bottom:20px}.controls label{display:flex;gap:8px;align-items:center;font-size:13px}.controls button,.controls select{padding:7px 12px;border:1px solid #bbcdb0;background:#fffdf6;border-radius:5px}.controls input{accent-color:#567a60}.transport-toolbar,.transport-table-head,.transport-foot{display:none}.application-city *{transition-duration:1s}.city-app-card .route-origin{pointer-events:none}</style><main><h1>The living city</h1><p>Illustrative data · Walking residents, active construction, moving deliveries and measured growth</p><div class="controls"><label>Lighting <select id="lighting"><option value="12">Day</option><option value="6">Sunrise</option><option value="18">Dusk</option><option value="21">Night</option></select></label><label>Construction <input id="growth" type="range" min="0" max="99" value="35"><output id="growth-label">35%</output></label><button id="traffic">Stop incoming traffic</button><button id="motion">Pause motion</button></div><div id="gallery"></div></main><script type="module" src="/living-demo.js"></script>`;
const script=`import {renderNetworkMap,TransportAnimator} from '/map.js';
import {CITY_STAGES} from '/cities.js';
import {speedButton} from '/speed.js';
import {updateMarkup} from '/render.js';
const gallery=document.querySelector('#gallery'),stages=[5,9,14],names=['firefox','Code','OneDrive'];
let running=true,paused=false,progress=.35,hour=12;
const animator=new TransportAnimator({wallClock:()=>new Date(2026,9,9,hour)});
function render(){
 const connections=stages.map((stage,i)=>({app:names[i],pid:10+i,scope:'Internet',protocol:'TCP',state:'Established',remoteAddress:'1.2.3.'+(i+1),remotePort:443,receiveRate:running?[180000,900000,2300000][i]:0,sendRate:running?[20000,70000,900000][i]:0,receivedBytes60m:12345678,sentBytes60m:654321}));
 const snapshot={connections,traffic:{available:true,cityUsage:connections.map((c,i)=>({...c,receivedBytesTotal:CITY_STAGES[stages[i]].at+(CITY_STAGES[stages[i]+1].at-CITY_STAGES[stages[i]].at)*progress,sentBytesTotal:0}))}};
 const state={snapshot,mode:'demo',mapApp:'all',mapQuery:'',mapDetail:'service',mapLimit:10,mapSort:'app',mapSortDirection:'asc',mapVehicle:'auto',motion:true,paused,mapExpanded:new Set()};
 const scenes=new Map([...gallery.querySelectorAll('.application-city')].map(svg=>[svg.dataset.cityKey,svg]));
 updateMarkup(gallery,renderNetworkMap({state,scenes,icon:()=>'',rate:n=>speedButton(n,'Mbit/s'),bytes:n=>n==null?'—':n>=1024**3?(n/1024**3).toFixed(1)+' GB':(n/1024**2).toFixed(1)+' MB',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}));
 animator.mount(gallery,{source:'living-preview',active:!paused});
}
document.querySelector('#lighting').onchange=e=>{hour=Number(e.target.value);animator.updateWorldClock();};
document.querySelector('#growth').oninput=e=>{progress=Number(e.target.value)/100;document.querySelector('#growth-label').value=e.target.value+'%';render();};
document.querySelector('#traffic').onclick=e=>{running=!running;e.target.textContent=running?'Stop incoming traffic':'Start incoming traffic';render();};
document.querySelector('#motion').onclick=e=>{paused=!paused;e.target.textContent=paused?'Resume motion':'Pause motion';render();};
render();setInterval(render,2000);`;
const assets=createAppServer({getSnapshot:()=>({})});
const server=createServer((req,res)=>{
 if(req.url==='/living-preview'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
 else if(req.url==='/living-demo.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(script);}
 else assets.emit('request',req,res);
});
server.listen(0,'127.0.0.1',()=>console.log('LIVING_CITY_PREVIEW http://127.0.0.1:'+server.address().port+'/living-preview'));

// Repeatable renderer audit: electron scripts/qa-performance.mjs --software --label=before
// CPU is reported in core-seconds, not Task Manager's machine-wide percentage.
import {app,BrowserWindow,protocol,ipcMain} from 'electron';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {demoSnapshot} from '../public/demo.js';
const software=process.argv.includes('--software');
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)||'current';
const baseline=process.argv.includes('--baseline');
const originals=new Map(baseline?['app.js','client.js','cities.js','city-canvas.js','map.js','render.js','world.js','transport.css','companion-ui.js','routes.js','living-city.js'].map(name=>[name,execFileSync('git',['show','HEAD:public/'+name])]):[]);
const output=resolve('test-results/performance');
protocol.registerSchemesAsPrivileged([{scheme:'perf',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setPath('userData',resolve(output,'profile-'+label));
if(software)app.disableHardwareAcceleration();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let sample=0;
const replayPath=process.argv.find(a=>a.startsWith('--snapshot='))?.slice(11);
const replay=replayPath?JSON.parse(await readFile(resolve(replayPath),'utf8')):null;
const live=process.argv.includes('--live');
// The installed app uses an isolated Electron bridge, not fetch. Keep that
// boundary in the default audit; --fetch is only a diagnostic comparison.
const desktopIPC=!process.argv.includes('--fetch');
const historyLoad=process.argv.includes('--history-load');
const {callCompanion,callCompanionText}=await import('../desktop/pipe.mjs');
const snapshot=()=>{
  if(live){sample++;return callCompanion(resolve(process.env.LOCALAPPDATA,'netKonnect','data'),'snapshot');}
  if(replay){sample++;replay.snapshot.timestamp=new Date().toISOString();replay.snapshot.traffic.timestamp=replay.snapshot.timestamp;return replay;}
  const s=demoSnapshot(),connection=s.connections.find(c=>c.scope==='Internet'&&c.pid!==0);
  sample++;
  s.timestamp=new Date().toISOString();s.traffic.timestamp=s.timestamp;
  s.connections=Array.from({length:10},(_,i)=>({...connection,id:`perf-${i}`,app:`perf-${i}`,pid:100+i,receiveRate:800*1024,sendRate:100*1024}));
  s.traffic.cityUsage=s.connections.map(c=>({...c,receivedBytesTotal:512*1024**3+sample*2*1024**3,sentBytesTotal:0}));
  s.traffic.usageConnections=[];
  if(historyLoad){
    const service={key:'fixture.example',label:'Fixture',kind:'hostname',hint:'fixture.example',confidence:'DNS clue',explanation:'Illustrative retained destination evidence. '.repeat(5),network:{name:'Fixture network',cidr:'192.0.2.0/24',source:'fixture',checkedAt:'2026-10-12'}};
    // Lifetime records do not contain minute-history arrays. Match their real
    // schema instead of multiplying a connection's 60-minute graph 7,000 times.
    s.traffic.cityUsage=Array.from({length:7000},(_,i)=>({key:`history-${i}`,app:`perf-${i%10}`,pid:100+i%10,scope:'Internet',service:{...service,network:{...service.network}},domainCandidates:['fixture.example'],remoteAddress:`192.0.2.${i%250+1}`,protocol:'TCP',remotePort:443,receivedBytesTotal:(512*1024**3+sample*2*1024**3)/700,sentBytesTotal:0}));
    s.traffic.usageConnections=Array.from({length:400},(_,i)=>({...connection,app:`perf-${i%10}`,pid:100+i%10,scope:'Internet',receiveRate:0,sendRate:0,receivedBytes60m:6000,sentBytes60m:600,usageHistory:Array.from({length:60},()=>({received:100,sent:10}))}));
  }
  return {snapshot:s,interval:2000,collecting:false,error:null};
};
app.whenReady().then(async()=>{
  console.log('PERFORMANCE_READY');
  const deadline=setTimeout(()=>{console.error('Performance audit timed out');app.exit(1);},120000);
  await mkdir(output,{recursive:true});
  // Like the installed desktop UI, this fixture uses local protocol assets.
  protocol.handle('perf',async request=>{
    const url=new URL(request.url);
    if(url.hostname!=='fixture')return new Response('Denied',{status:403});
    if(url.pathname==='/api/snapshot')return Response.json(await snapshot());
    const path=resolve('public','.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(resolve('public')+'\\'))return new Response('Denied',{status:403});
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[extname(path)];
    try{return new Response(originals.get(url.pathname.slice(1))||await readFile(path),{headers:{'Content-Type':type||'application/octet-stream'}});}catch{return new Response('Missing',{status:404});}
  });
  // Normal onscreen compositing; offscreen capture has a separate bitmap cost.
  if(desktopIPC){
    ipcMain.handle('nk:snapshot',()=>snapshot());
    ipcMain.handle('nk:snapshot-text',async()=>{
      if(live){sample++;return callCompanionText(resolve(process.env.LOCALAPPDATA,'netKonnect','data'),'snapshot');}
      return JSON.stringify({result:await snapshot()});
    });
    ipcMain.handle('nk:setup-status',()=>({complete:true,checks:[],version:'audit',startupAvailable:true}));
  }
  const window=new BrowserWindow({show:true,width:1440,height:1100,webPreferences:{...(desktopIPC?{preload:resolve('desktop/preload.cjs')}:{}),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=code=>window.webContents.executeJavaScript(code);
  const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  const cdp=window.webContents.debugger;
  try {
    console.log('PERFORMANCE_LOADING');
    await window.loadURL('perf://fixture/'+(process.argv.includes('--svg')?'?renderer=svg':''));
    window.focus();
    console.log('PERFORMANCE_LOADED');
    cdp.attach('1.3');await cdp.sendCommand('Performance.enable');
    await wait(3500);
    let layerTree=[];
    cdp.on('message',(_event,method,params)=>{if(method==='LayerTree.layerTreeDidChange'&&params.layers)layerTree=params.layers;});
    await cdp.sendCommand('LayerTree.enable');await wait(500);
    const initialLayers=layerTree;
    const layerReasons={};
    for(const layer of initialLayers) {
      const result=await cdp.sendCommand('LayerTree.compositingReasons',{layerId:layer.layerId}).catch(()=>({compositingReasons:[]}));
      for(const reason of result.compositingReasons)layerReasons[reason]=(layerReasons[reason]||0)+1;
    }
    const layers={count:initialLayers.length,drawing:initialLayers.filter(layer=>layer.drawsContent).length,reasons:layerReasons};
    layers.animations=await run(`(()=>{const counts={};for(const animation of document.getAnimations()){const svg=animation.effect?.target?.closest('.application-city');if(!svg)continue;const key=(svg.hasAttribute('data-offscreen')?'offscreen:':'visible:')+(animation.animationName||animation.constructor.name);counts[key]=(counts[key]||0)+1;}return counts;})()`);
    if(process.argv.includes('--census')) {
      const nodes={};
      for(const layer of initialLayers)if(layer.backendNodeId) {
        const {node}=await cdp.sendCommand('DOM.describeNode',{backendNodeId:layer.backendNodeId}).catch(()=>({node:{}}));
        const attributes=node.attributes||[],classAt=attributes.indexOf('class'),key=classAt>=0?attributes[classAt+1]:node.nodeName||'unknown';
        nodes[key]=(nodes[key]||0)+1;
      }
      layers.nodes=nodes;
      await writeFile(resolve(output,label+'-layers.json'),JSON.stringify(layers,null,2));
    }
    await cdp.sendCommand('LayerTree.disable');
    console.log('LAYERS '+JSON.stringify(layers));
    if(process.argv.includes('--census')){assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--churn'))await run(`window.churn=setInterval(()=>{const el=document.querySelector('#map-vehicle');el.value=el.value==='pickup'?'semi':'pickup';el.dispatchEvent(new Event('change',{bubbles:true}));},2000)`);
    const measure=async(name,ms=10500)=>{
      await run(`(async()=>{
        const {TransportAnimator}=await import('/map.js');
        const {CityCanvas}=await import('/city-canvas.js');
        const p=window.performanceProbe={frames:[],longTasks:[],draws:0,drawMs:0,parses:0,parseChars:0,parseMs:0,queries:0,attributes:0};
        p.paints=[];p.paint=CityCanvas.prototype.paint;
        CityCanvas.prototype.paint=function(...args){if(!p.city)p.city=this;if(p.city===this)p.paints.push(performance.now());return p.paint.apply(this,args);};
        p.refresh=CityCanvas.prototype.refresh;p.refreshes={};let refreshing=false;
        CityCanvas.prototype.refresh=function(n){const root=!refreshing,t=performance.now();refreshing=true;try{return p.refresh.call(this,n);}finally{if(root){refreshing=false;const key=n.attrs.class||n.tag,r=p.refreshes[key]??={count:0,ms:0};r.count++;r.ms+=performance.now()-t;}}};
        p.draw=TransportAnimator.prototype.draw;
        TransportAnimator.prototype.draw=function(...args){const t=performance.now();try{return p.draw.apply(this,args);}finally{p.draws++;p.drawMs+=performance.now()-t;}};
        p.html=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
        Object.defineProperty(Element.prototype,'innerHTML',{...p.html,set(value){const t=performance.now();try{return p.html.set.call(this,value);}finally{p.parses++;p.parseChars+=value.length;p.parseMs+=performance.now()-t;}}});
        p.query=Element.prototype.querySelector;p.queryAll=Element.prototype.querySelectorAll;p.attr=Element.prototype.setAttribute;
        Element.prototype.querySelector=function(...args){p.queries++;return p.query.apply(this,args);};
        Element.prototype.querySelectorAll=function(...args){p.queries++;return p.queryAll.apply(this,args);};
        Element.prototype.setAttribute=function(...args){p.attributes++;return p.attr.apply(this,args);};
        p.observer=new PerformanceObserver(list=>p.longTasks.push(...list.getEntries().map(e=>({at:e.startTime,duration:e.duration}))));p.observer.observe({type:'longtask'});
        let last=performance.now();function frame(now){p.frames.push(now-last);last=now;p.frame=requestAnimationFrame(frame);}p.frame=requestAnimationFrame(frame);
      })()`);
      const before=app.getAppMetrics(),metricsBefore=await cdp.sendCommand('Performance.getMetrics'),began=performance.now(),polls=sample;
      await wait(ms);
      const elapsed=(performance.now()-began)/1000,after=app.getAppMetrics(),metricsAfter=await cdp.sendCommand('Performance.getMetrics');
      const report=await run(`(async()=>{
        const {TransportAnimator}=await import('/map.js');const p=window.performanceProbe;
        const {CityCanvas}=await import('/city-canvas.js');CityCanvas.prototype.paint=p.paint;
        CityCanvas.prototype.refresh=p.refresh;
        cancelAnimationFrame(p.frame);p.observer.disconnect();TransportAnimator.prototype.draw=p.draw;
        Object.defineProperty(Element.prototype,'innerHTML',p.html);Element.prototype.querySelector=p.query;Element.prototype.querySelectorAll=p.queryAll;Element.prototype.setAttribute=p.attr;
        const gaps=p.frames.slice(1).sort((a,b)=>a-b);
        const paints=p.paints.slice(1).map((t,i)=>t-p.paints[i]).sort((a,b)=>a-b);
        return {cityPaints:paints.length,medianPaintMs:paints[Math.floor(paints.length*.5)],p95PaintMs:paints[Math.floor(paints.length*.95)],maxPaintMs:paints.at(-1),paintHitches:paints.filter(t=>t>50).length,frames:gaps.length,medianFrameMs:gaps[Math.floor(gaps.length*.5)],p95FrameMs:gaps[Math.floor(gaps.length*.95)],maxFrameMs:gaps.at(-1),longTasks:p.longTasks,draws:p.draws,drawMs:p.drawMs,parses:p.parses,parseChars:p.parseChars,parseMs:p.parseMs,queries:p.queries,attributes:p.attributes,visibleCities:document.querySelectorAll('.application-city:not([data-offscreen])').length,cities:document.querySelectorAll('.application-city').length,vehicles:document.querySelectorAll('.transport-vehicle').length};
      })()`);
      const processes=after.map(p=>({type:p.type,cpuSeconds:(p.cpu.cumulativeCPUUsage||0)-(before.find(b=>b.pid===p.pid)?.cpu.cumulativeCPUUsage||0),workingSetKB:p.memory.workingSetSize}));
      const metrics=Object.fromEntries(metricsAfter.metrics.filter(m=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(m.name)).map(m=>[m.name,m.value-(metricsBefore.metrics.find(b=>b.name===m.name)?.value||0)]));
      const refreshes=await run('performanceProbe.refreshes');
      const result={name,elapsed,polls:sample-polls,...report,refreshes,processes,totalCpuSeconds:processes.reduce((sum,p)=>sum+p.cpuSeconds,0),metrics};
      await writeFile(resolve(output,label+'-'+name+'-measurement.json'),JSON.stringify(result,null,2));
      if(process.argv.includes('--assert-smooth')&&['desktop','compact'].includes(name)){
        assert.ok(result.cityPaints>=result.frames*.9,`${name}: city follows display cadence`);
        assert.ok(result.maxPaintMs<50,`${name}: no traffic paint stalls of 50 ms or more`);
      }
      console.log('PERFORMANCE '+JSON.stringify({...result,longTasks:result.longTasks.length}));return result;
    };
    if(process.argv.includes('--trace'))await cdp.sendCommand('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc',transferMode:'ReturnAsStream'});
    if(process.argv.includes('--profile')){await cdp.sendCommand('Profiler.enable');await cdp.sendCommand('Profiler.start');}
    const reports=[await measure('desktop',Number(process.argv.find(a=>a.startsWith('--duration='))?.slice(11))||10500)];
    if(process.argv.includes('--profile')){const {profile}=await cdp.sendCommand('Profiler.stop');await writeFile(resolve(output,label+'-cpu.json'),JSON.stringify(profile));}
    if(process.argv.includes('--gpu-counters')){
      const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','scripts/qa-resources.ps1','-RootPid',String(process.pid),'-Seconds','10','-Output',resolve(output,label+'-gpu.json')],{windowsHide:true});
      console.log('GPU_COUNTERS '+stdout.trim());
    }
    if(process.argv.includes('--trace')) {
      const finished=new Promise(r=>cdp.on('message',(_event,method,params)=>{if(method==='Tracing.tracingComplete')r(params.stream);}));
      await cdp.sendCommand('Tracing.end');const stream=await finished;let json='';
      while(true){const chunk=await cdp.sendCommand('IO.read',{handle:stream});json+=chunk.data;if(chunk.eof)break;}
      await cdp.sendCommand('IO.close',{handle:stream});await writeFile(resolve(output,label+'-trace.json'),json);
      const durations=new Map();for(const event of JSON.parse(json).traceEvents)if(event.ph==='X'&&event.dur){const key=event.name;durations.set(key,(durations.get(key)||0)+event.dur/1000);}
      console.log('TRACE '+JSON.stringify([...durations].sort((a,b)=>b[1]-a[1]).slice(0,35)));
    }
    await writeFile(resolve(output,label+'-desktop.png'),(await window.webContents.capturePage()).toPNG());
    if(process.argv.includes('--draw-experiments')) {
      await run(`(async()=>{const {TransportAnimator}=await import('/map.js');window.originalDraw=TransportAnimator.prototype.draw;TransportAnimator.prototype.draw=function(){};})()`);
      reports.push(await measure('without-vehicle-draw',5500));
      await run(`(async()=>{const {TransportAnimator}=await import('/map.js');TransportAnimator.prototype.draw=window.originalDraw;})()`);
      const key=await window.webContents.insertCSS('.application-city * {animation-play-state:paused !important; transition:none !important;}');
      reports.push(await measure('vehicle-draw-only',5500));
      await window.webContents.removeInsertedCSS(key);
      await writeFile(resolve(output,label+'.json'),JSON.stringify({label,software,layers,reports,errors},null,2));
      assert.deepEqual(errors,[]);return;
    }
    if(process.argv.includes('--desktop-only')) {
      assert.deepEqual(errors,[]);
      await writeFile(resolve(output,label+'.json'),JSON.stringify({label,software,desktopIPC,historyLoad,gpu:app.getGPUFeatureStatus(),layers,reports,errors},null,2));return;
    }
    if(process.argv.includes('--layers')) {
      for(const [name,css] of [
        ['without-filters','.application-city * {filter:none !important;}'],
        ['without-resident-motion','.resident-walk,.resident-facing,.resident-stride {animation:none !important;}'],
        ['without-actor-poses','.resident-stride,.living-pose {animation:none !important;}'],
        ['without-foliage','.living-foliage {animation:none !important;}'],
        ['without-css-motion','.application-city * {animation:none !important;transition:none !important;}']
      ]) {
        const key=await window.webContents.insertCSS(css);await wait(1000);reports.push(await measure(name,6000));await window.webContents.removeInsertedCSS(key);
      }
    }
    window.setSize(900,700);await run('scrollTo(0,0)');await wait(1200);
    reports.push(await measure('compact'));
    await run('clearInterval(window.churn)');
    await run(`document.querySelector('[data-action="pause"]').click()`);await wait(500);
    reports.push(await measure('paused',4500));
    await run(`document.querySelector('[data-action="pause"]').click()`);await wait(500);
    window.webContents.setBackgroundThrottling(true);window.minimize();await wait(1500);reports.push(await measure('minimized',4500));
    assert.deepEqual(errors,[]);
    const result={label,software,desktopIPC,historyLoad,gpu:app.getGPUFeatureStatus(),layers,reports,errors};
    await writeFile(resolve(output,label+'.json'),JSON.stringify(result,null,2));
  }finally{clearTimeout(deadline);window.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

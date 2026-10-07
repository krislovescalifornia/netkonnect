// Replay observed Firefox destination addresses with fixture rates; no live
// collector, browser integration, or installed application is modified.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../lib/http.mjs';

app.setPath('userData',resolve('test-results/service-preview-profile'));
app.whenReady().then(async()=>{
  const timestamp=new Date().toISOString(), errors=[];
  const destinations=['2001:1890:1d10:6600::c','2607:f8b0:4023:1433::88','34.107.243.93','2a06:98c1:52::4','203.0.113.17'];
  const connections=destinations.map((remoteAddress,i)=>({id:'service-qa-'+i,app:'firefox',pid:10,scope:'Internet',protocol:i===0||i===3?'UDP':'TCP',
    state:i===0||i===3?'Observed':'Established',localAddress:'192.168.1.2',localPort:50000+i,remoteAddress,remotePort:443,
    domainCandidates:[],firstSeen:timestamp,receiveRate:i===0?808850:0,sendRate:i===0?3100:0}));
  const snapshot={timestamp,computer:'Service identification fixture',mode:'live',issues:[],adapters:[],connections,
    totals:{ready:true,receiveRate:808850,sendRate:3100},history:[],traffic:{available:true,timestamp,eventsLost:0,usageConnections:[],cityUsage:[]}};
  const server=createAppServer({getSnapshot:()=>({snapshot,interval:2000,collecting:false,error:null}),getAnalytics:()=>({})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const window=new BrowserWindow({show:false,width:1440,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}`);
    await new Promise(resolve=>setTimeout(resolve,1000));
    await window.webContents.executeJavaScript(`document.querySelector('[data-map-expand="firefox"]').click()`);
    await new Promise(resolve=>setTimeout(resolve,200));
    const inspect=()=>window.webContents.executeJavaScript(`(()=>({insight:document.querySelector('.service-insight').textContent,
      labels:[...document.querySelectorAll('.application-child .route-terminal strong')].map(e=>e.textContent),
      health:document.querySelector('.evidence-health').textContent,overflow:document.documentElement.scrollWidth>innerWidth}))()`);
    const desktop=await inspect();
    assert.match(desktop.insight,/0 named · 4 network hints · 1 unidentified or shared/);
    assert.equal(desktop.labels.filter(s=>s.includes('service unknown')).length,4);
    assert.ok(desktop.labels.includes('Unidentified service'));
    assert.equal(desktop.overflow,false);
    await mkdir(resolve('test-results/services'),{recursive:true});
    await writeFile(resolve('test-results/services/desktop.png'),(await window.webContents.capturePage()).toPNG());
    window.setSize(760,1200);
    await new Promise(resolve=>setTimeout(resolve,150));
    const narrow=await inspect();assert.equal(narrow.overflow,false);
    await writeFile(resolve('test-results/services/narrow.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('[data-route="firefox|2001:1890:1d10:6600::c"]').click()`);
    const drawer=await window.webContents.executeJavaScript(`document.querySelector('.drawer').textContent`);
    assert.match(drawer,/What this destination tells us/);assert.match(drawer,/Network hint only/);assert.match(drawer,/Possible QUIC/);
    await writeFile(resolve('test-results/services/details.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('[data-action="close"]').click()`);
    const stream=connections[0];
    stream.browserEvidence=[{source:'firefox',hostname:'rr1.googlevideo.com',address:stream.remoteAddress,port:443,site:'tv.youtube.com',resourceType:'media',httpVersion:'HTTP/3',seenAt:Date.now(),security:{protocolVersion:'TLSv1.3',cipherSuite:'TLS_AES_128_GCM_SHA256',certificateIssuer:'CN=Example CA',usedPrivateDns:true,usedEch:true}}];
    stream.owner={path:'C:\\Program Files\\Mozilla Firefox\\firefox.exe',product:'Firefox',company:'Mozilla Corporation',fileVersion:'157.0',startedAt:timestamp};
    stream.networkPath={adapter:'Ethernet',interfaceIndex:6,nextHop:'fe80::1',destinationPrefix:'::/0',dnsServers:['192.168.1.254']};
    snapshot.enrichment={browser:true,enhancedLookup:false};snapshot.evidence={records:1,dropped:0,sources:{firefox:{available:true,updatedAt:Date.now(),message:'Connected locally'}}};
    await new Promise(resolve=>setTimeout(resolve,2200));
    const enriched=await inspect();assert.ok(enriched.labels.includes('YouTube TV'));assert.match(enriched.health,/Firefox: connected/);
    await writeFile(resolve('test-results/services/firefox-context.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('[data-route="firefox|youtube-tv"]').click()`);
    const evidence=await window.webContents.executeJavaScript(`document.querySelector('.drawer').textContent`);
    assert.match(evidence,/Firefox request clue/);assert.match(evidence,/TLSv1.3/);assert.match(evidence,/tv.youtube.com/);assert.match(evidence,/Mozilla Corporation/);assert.match(evidence,/Ethernet/);assert.match(evidence,/Online lookups are off/);
    await new Promise(resolve=>setTimeout(resolve,250));
    await writeFile(resolve('test-results/services/firefox-details.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('[data-action="close"]').click()`);
    for(const browser of ['chrome','edge']){
      const connection={...stream,id:browser+'-fixture',app:browser==='edge'?'msedge':'chrome',pid:browser==='edge'?30:20,
        browserEvidence:[{...stream.browserEvidence[0],source:browser,security:null,httpVersion:null,responseVersion:'HTTP/1.1',proxyMode:'direct'}]};
      connections.push(connection);snapshot.enrichment[browser]=true;snapshot.evidence.sources[browser]={available:true,updatedAt:Date.now(),message:'Connected locally'};
    }
    await new Promise(resolve=>setTimeout(resolve,2200));
    for(const [browser,label] of [['chrome','Chrome'],['edge','Edge']]){
      const app=browser==='edge'?'msedge':'chrome';
      await window.webContents.executeJavaScript(`document.querySelector('[data-map-expand="${browser}"]').click()`);
      await window.webContents.executeJavaScript(`document.querySelector('[data-route="${app}|youtube-tv"]').click()`);
      const text=await window.webContents.executeJavaScript(`document.querySelector('.drawer').textContent`);
      assert.match(text,new RegExp(label+' request clue'));assert.match(text,/Unavailable through this browser/);assert.match(text,/tv.youtube.com/);assert.doesNotMatch(text,/TLSv1.3/);
      await writeFile(resolve(`test-results/services/${browser}-details.png`),(await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('[data-action="close"]').click()`);
    }
    const browsers=await inspect();assert.match(browsers.health,/Chrome: connected/);assert.match(browsers.health,/Edge: connected/);
    // Render the shared Preferences content used by the desktop IPC bridge.
    await window.webContents.executeJavaScript(`(async()=>{const {enrichmentPreferences}=await import('/enrichment.js');const host=document.createElement('div');host.className='drawer open';host.id='browser-prefs-fixture';host.innerHTML=enrichmentPreferences({browser:false,chrome:false,edge:false,enhancedLookup:false},value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'));document.body.append(host);})()`);
    const preferences=await window.webContents.executeJavaScript(`(()=>({switches:[...document.querySelectorAll('#browser-prefs-fixture [data-enrichment-feature]')].map(e=>[e.dataset.enrichmentFeature,e.getAttribute('aria-checked')]),exports:document.querySelectorAll('#browser-prefs-fixture [data-export-browser]').length,overflow:document.documentElement.scrollWidth>innerWidth}))()`);
    assert.equal(preferences.switches.length,4);assert.ok(preferences.switches.every(([,state])=>state==='false'));assert.equal(preferences.exports,2);assert.equal(preferences.overflow,false);
    await new Promise(resolve=>setTimeout(resolve,250));
    await writeFile(resolve('test-results/services/browser-preferences.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('#browser-prefs-fixture').remove()`);
    snapshot.adapters=[{id:'os-adapter-fixture',name:'Ethernet',description:'OS collection audit fixture',status:'Up',speed:'1 Gbps',interfaceIndex:6,virtual:true,hidden:true,
      ipv4:['192.168.1.2'],ipv6:['fe80::2'],gateway:['192.168.1.1','fe80::1'],dns:['192.168.1.1'],mac:'00-11-22-33-44-55',receivedBytes:null,sentBytes:null,receivedErrors:null,sentErrors:null,
      receivedPackets:500,sentPackets:200,receivedDiscards:3,sentDiscards:0,ipInterfaces:[{family:'IPv6',mtu:1500,metric:25,dhcp:'Enabled',forwarding:'Disabled'}]}];
    await new Promise(resolve=>setTimeout(resolve,2200));
    await window.webContents.executeJavaScript(`document.querySelector('[data-page="adapters"]').click()`);
    const adapters=await window.webContents.executeJavaScript(`(()=>({text:document.querySelector('.adapter-grid').textContent,overflow:document.documentElement.scrollWidth>innerWidth}))()`);
    assert.match(adapters.text,/Virtual.*Hidden/);assert.match(adapters.text,/fe80::1/);assert.match(adapters.text,/MTU 1500/);assert.match(adapters.text,/Unavailable received/);assert.match(adapters.text,/Unavailable packet errors/);assert.equal(adapters.overflow,false);
    await window.webContents.executeJavaScript('window.scrollTo(0,0)');
    await new Promise(resolve=>setTimeout(resolve,250));
    await writeFile(resolve('test-results/services/os-adapters.png'),(await window.webContents.capturePage()).toPNG());
    assert.deepEqual(errors,[]);
    await writeFile(resolve('test-results/services/results.json'),JSON.stringify({fixture:true,desktop,narrow,details:true,enriched,browsers,preferences,adapters,errors},null,2));
    console.log('SERVICE_UI_VERIFIED '+JSON.stringify({desktop,narrow,details:true,enriched}));
  } finally {window.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});

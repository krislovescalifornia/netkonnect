import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {EvidenceStore} from '../lib/evidence.mjs';
import {serviceIdentity} from '../public/service-evidence.js';
import {enrichmentPreferences,evidenceDetails,evidenceHealth} from '../public/enrichment.js';
import {packageExtension} from '../scripts/package-firefox.mjs';

const event=()=>({listeners:[],addListener(listener){this.listeners.push(listener);}});
for(const name of ['chrome','edge'])test(`${name} MV3 observes hostname metadata, reconnects after suspension, and excludes private/cache/proxy requests`,async()=>{
 const timers=[],messages=[],hooks=Object.fromEntries(['onBeforeRequest','onResponseStarted','onCompleted','onErrorOccurred'].map(key=>[key,event()]));
 let connects=0,proxyMode='direct';
 const native={onMessage:event(),onDisconnect:event(),postMessage(value){messages.push(JSON.parse(JSON.stringify(value)));},disconnect(){this.onDisconnect.listeners.forEach(fn=>fn());}};
 const chrome={runtime:{connectNative(host){connects++;assert.equal(host,`org.netkonnect.${name}`);return native;},onMessage:event()},webRequest:hooks,
  proxy:{settings:{get(options,callback){assert.equal(options.incognito,false);callback({value:{mode:proxyMode,pacScript:{url:'https://secret.example/proxy?token=secret'}}});},onChange:event()}},
  tabs:{onRemoved:event(),onUpdated:event(),query:async()=>[{id:1,url:'https://tv.youtube.com/watch/private?token=secret'},{id:2,url:'https://private.example',incognito:true}]},
  storage:{local:{get:async()=>({enabled:true}),set:async()=>{}}},action:{setBadgeText(){}},alarms:{onAlarm:event(),create(key,options){assert.equal(key,'netkonnect-reconnect');assert.equal(options.periodInMinutes,.5);}}};
 vm.runInNewContext(await readFile(new URL(`../browser/${name}/background.js`,import.meta.url),'utf8'),{chrome,URL,Date,TextEncoder,setInterval:(fn,ms)=>timers.push({fn,ms})});
 await new Promise(resolve=>setImmediate(resolve));native.onMessage.listeners[0]({enabled:true});
 const details={requestId:'secret-request-id',tabId:1,url:'https://rr1.googlevideo.com/videoplayback?token=secret',initiator:'https://tv.youtube.com',ip:'8.8.8.8',type:'media',statusLine:'HTTP/1.1 200'};
 hooks.onResponseStarted.listeners[0](details);
 hooks.onResponseStarted.listeners[0]({...details,incognito:true});hooks.onResponseStarted.listeners[0]({...details,fromCache:true});
 timers.find(t=>t.ms===2000).fn();assert.equal(messages[1].events.length,1);
 const record=messages[1].events[0];assert.equal(record.hostname,'rr1.googlevideo.com');assert.equal(record.site,'tv.youtube.com');assert.equal(record.security,null);assert.equal(record.proxyMode,'direct');
 assert.doesNotMatch(JSON.stringify(record),/token|videoplayback|secret-request|private.example|pacScript/);
 native.onMessage.listeners[0]({enabled:true});timers.find(t=>t.ms===15000).fn();timers.find(t=>t.ms===2000).fn();assert.equal(messages[2].events[0].phase,'active');
 native.onMessage.listeners[0]({enabled:true});hooks.onCompleted.listeners[0](details);timers.find(t=>t.ms===2000).fn();assert.equal(messages[3].events[0].phase,'completed');
 native.onMessage.listeners[0]({enabled:true});proxyMode='fixed_servers';chrome.proxy.settings.onChange.listeners[0]();hooks.onResponseStarted.listeners[0](details);timers.find(t=>t.ms===2000).fn();assert.equal(messages[4].events[0].proxied,true);
 native.onMessage.listeners[0]({enabled:false});hooks.onResponseStarted.listeners[0](details);timers.find(t=>t.ms===2000).fn();assert.deepEqual(messages[5].events,[]);
 native.disconnect();chrome.alarms.onAlarm.listeners[0]({name:'netkonnect-reconnect'});assert.equal(connects,2);
 const respond=message=>new Promise(resolve=>{assert.equal(chrome.runtime.onMessage.listeners[0](message,{},resolve),true);});
 await respond({action:'toggle'});const before=messages.length;timers.forEach(t=>t.fn());chrome.alarms.onAlarm.listeners[0]({name:'netkonnect-reconnect'});assert.equal(messages.length,before);
 assert.equal((await respond({action:'status'})).enabled,false);
});

test('three browsers sharing an IP retain separate page context, independent switches and honest proxy/TLS limits',()=>{
 const now=Date.now(),base={hostname:'rr1.googlevideo.com',address:'8.8.8.8',port:443,scheme:'https',phase:'active',seenAt:now,proxyMode:'direct',security:{protocolVersion:'spoofed TLS'}};
 const store=new EvidenceStore({browserEnabled:true,browsers:{chrome:true,edge:true}});
 for(const source of ['firefox','chrome','edge'])store.browserBatch({version:1,source,events:[{...base,site:source==='chrome'?'www.youtube.com':'tv.youtube.com'}]},now);
 const connection={remoteAddress:'8.8.8.8',remotePort:443,protocol:'TCP'};
 for(const app of ['firefox','chrome','msedge']){
  const c=store.annotate({...connection,app},now);assert.equal(c.browserEvidence.length,1);
  assert.equal(c.browserEvidence[0].source,app==='msedge'?'edge':app);
  assert.equal(serviceIdentity(c).label,app==='chrome'?'YouTube · video CDN':'YouTube TV');
  if(app!=='firefox'){assert.equal(c.browserEvidence[0].security,null);assert.match(evidenceDetails(c,{esc:String},{}),/Unavailable through this browser/);}
 }
 assert.equal(store.annotate({...connection,app:'msedgewebview2'},now).browserEvidence.length,0);
 assert.equal(store.annotate({...connection,app:'other'},now).browserEvidence.length,0);
 store.setBrowserEnabled(false,'chrome');assert.equal(store.annotate({...connection,app:'chrome'},now).browserEvidence.length,0);assert.equal(store.annotate({...connection,app:'msedge'},now).browserEvidence.length,1);
 assert.throws(()=>store.browserBatch({version:1,source:'unknown',events:[]},now),/source/);
 store.browserBatch({version:1,source:'edge',events:[{...base,proxyMode:'system',site:'tv.youtube.com'}]},now);
 // Same destination replaces the prior direct-mode record; system configuration must be known and clear.
 assert.equal(store.annotate({...connection,app:'msedge'},now).browserEvidence.length,0);
 store.snapshot({systemProxy:{known:true,configured:false},connections:[]},now);assert.equal(store.annotate({...connection,app:'msedge'},now).browserEvidence.length,1);
 store.snapshot({systemProxy:{known:true,configured:true},connections:[]},now);assert.equal(store.annotate({...connection,app:'msedge'},now).browserEvidence.length,0);
 assert.equal(store.annotate({...connection,app:'firefox'},now+45000).browserEvidence.length,0);
 const prefs=enrichmentPreferences({browser:false,chrome:false,edge:false,enhancedLookup:false},String);assert.equal((prefs.match(/aria-checked="false"/g)||[]).length,4);assert.match(prefs,/chrome:\/\/extensions/);assert.match(prefs,/edge:\/\/extensions/);
 const health=evidenceHealth({enrichment:{chrome:true,edge:false},evidence:{sources:{chrome:{available:true,updatedAt:now}}}},String);assert.match(health,/Chrome: connected/);assert.match(health,/Edge: off/);
});

test('Chromium extension archives and stable IDs match their native host allowlists',async()=>{
 const identities=JSON.parse(await readFile(new URL('../browser/identities.json',import.meta.url),'utf8')),host=await readFile(new URL('../lib/BrowserHost.cs',import.meta.url),'utf8');
 for(const browser of ['chrome','edge']){
  const manifest=JSON.parse(await readFile(new URL(`../browser/${browser}/manifest.json`,import.meta.url),'utf8'));
  const id=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].flatMap(b=>[b>>4,b&15]).map(n=>String.fromCharCode(97+n)).join('');
  assert.equal(id,identities[browser].id);assert.ok(host.includes(`chrome-extension://${id}/`));assert.equal(manifest.manifest_version,3);assert.equal(manifest.incognito,'not_allowed');assert.equal(manifest.content_scripts,undefined);assert.ok(!manifest.permissions.includes('history'));assert.ok(!manifest.permissions.includes('webRequestBlocking'));
  assert.ok((await packageExtension(undefined,{browser,write:false})).equals(await readFile(new URL(`../browser/netKonnect-${browser}-Service-Insight.zip`,import.meta.url))));
 }
 assert.notEqual(identities.chrome.id,identities.edge.id);
});

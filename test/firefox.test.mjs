import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('Firefox hooks forward hostname-only TLS evidence, skip cached/private requests, and clear observations when paused',async()=>{
  const event=()=>({listeners:[],addListener(listener){this.listeners.push(listener);}}),timers=[],messages=[];
  const native={onMessage:event(),onDisconnect:event(),postMessage(message){messages.push(JSON.parse(JSON.stringify(message)));},disconnect(){this.onDisconnect.listeners.forEach(f=>f());}};
  const hooks=Object.fromEntries(['onBeforeRequest','onHeadersReceived','onResponseStarted','onCompleted','onErrorOccurred'].map(name=>[name,event()]));
  let queried=0;
  const browser={webRequest:{...hooks,getSecurityInfo:async()=>({state:'secure',protocolVersion:'TLSv1.3',usedPrivateDns:true,certificates:[{issuer:'CN=CA',subject:'CN=*.googlevideo.com',rawDER:'DO NOT FORWARD'}]})},
    runtime:{connectNative(name){assert.equal(name,'org.netkonnect.firefox');return native;},onMessage:event()},
    tabs:{onRemoved:event(),onUpdated:event(),query:async()=>{queried++;return [{id:1,url:'https://tv.youtube.com/watch/private?token=secret',incognito:false},{id:2,url:'https://secret.example',incognito:true}];}},
    storage:{local:{get:async()=>({enabled:true}),set:async()=>{}}},browserAction:{setBadgeText(){}}};
  const source=await readFile(new URL('../browser/firefox/background.js',import.meta.url),'utf8');
  vm.runInNewContext(source,{browser,URL,Date,TextEncoder,setInterval:(fn,ms)=>timers.push({fn,ms})});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queried,1);assert.equal(messages.length,1);assert.deepEqual(messages[0],{version:1,events:[]});native.onMessage.listeners[0]({enabled:true,accepted:0});
  const details={requestId:'request-secret',tabId:1,url:'https://rr1.googlevideo.com/videoplayback?token=secret',type:'media',ip:'2001:1890:1d10:6600::c',statusLine:'HTTP/3 200',incognito:false};
  await hooks.onHeadersReceived.listeners[0](details);hooks.onResponseStarted.listeners[0](details);
  hooks.onResponseStarted.listeners[0]({...details,requestId:'private',incognito:true});hooks.onResponseStarted.listeners[0]({...details,requestId:'cached',fromCache:true});
  timers.find(t=>t.ms===2000).fn();assert.equal(messages[1].events.length,1);const record=messages[1].events[0];
  assert.equal(record.hostname,'rr1.googlevideo.com');assert.equal(record.site,'tv.youtube.com');assert.equal(record.security.usedPrivateDns,true);assert.equal(record.security.certificateIssuer,'CN=CA');
  assert.doesNotMatch(JSON.stringify(record),/token=|videoplayback|request-secret|rawDER|secret\.example/);
  native.onMessage.listeners[0]({enabled:true,accepted:1});hooks.onCompleted.listeners[0](details);timers.find(t=>t.ms===2000).fn();assert.equal(messages[2].events[0].phase,'completed');
  native.onMessage.listeners[0]({enabled:false,accepted:0});hooks.onResponseStarted.listeners[0](details);timers.find(t=>t.ms===2000).fn();assert.deepEqual(messages[3].events,[]);
  const blocked=await browser.runtime.onMessage.listeners[0]({action:'status'});assert.equal(blocked.connected,false);assert.match(blocked.error,/Paused in netKonnect/);
  await browser.runtime.onMessage.listeners[0]({action:'toggle'});const before=messages.length;hooks.onResponseStarted.listeners[0](details);timers.forEach(t=>t.fn());assert.equal(messages.length,before);
  const state=await browser.runtime.onMessage.listeners[0]({action:'status'});assert.equal(state.enabled,false);assert.equal(state.active,0);
});

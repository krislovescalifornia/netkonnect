/* Browser APIs supply metadata directly; no content scripts, DNS queries,
   packet capture, external requests, or browsing-history reads. */
const hostName=value=>{try {const u=new URL(value);return ['http:','https:','ws:','wss:'].includes(u.protocol)?u.hostname:null;}catch{return null;}};
const active=new Map(),sites=new Map(),tls=new Map(),pending=new Map();
let enabled=false,port=null,inFlight=false,lastSent=0,lastError='Connecting to local companion…',received=false,blocked=false;
let proxyMode='unknown';
function refreshProxy(){chrome.proxy.settings.get({incognito:false},settings=>{
  if(chrome.runtime.lastError){proxyMode='unknown';return;}
  const mode=settings?.value?.mode||'unknown';
  if(mode!==proxyMode){active.clear();pending.clear();}
  proxyMode=mode;
});}
chrome.proxy.settings.onChange.addListener(refreshProxy);
refreshProxy();
const max=512;
const put=(map,key,value)=>{if(map.size>=max&&!map.has(key))map.delete(map.keys().next().value);map.set(key,value);};
function connect() {
  if(!enabled||port)return;
  try {
    port=chrome.runtime.connectNative('org.netkonnect.edge');
    port.onMessage.addListener(message=>{
      inFlight=false;
      if(message.error){lastError=message.error;received=false;return;}
      received=true;blocked=message.enabled===false;lastError=blocked?'Paused in netKonnect preferences':'';
      if(blocked){active.clear();pending.clear();tls.clear();sites.clear();}else if(!sites.size)seedSites();
      chrome.action.setBadgeText({text:blocked?'Ⅱ':'ON'});
    });
    port.onDisconnect.addListener(()=>{lastError=chrome.runtime.lastError?.message||'Local companion disconnected';port=null;inFlight=false;received=false;chrome.action.setBadgeText({text:'!'});});
    port.postMessage({version:1,events:[]});inFlight=true;lastSent=Date.now();
  }catch(error){lastError=error.message;port=null;}
}
function flush() {
  if(!enabled)return;
  if(inFlight&&Date.now()-lastSent>10000){port?.disconnect();port=null;inFlight=false;received=false;}
  connect();
  if(!port||inFlight)return;
  const events=[],keys=[];let size=32;
  if(!blocked)for(const [key,record] of pending) {
    const bytes=new TextEncoder().encode(JSON.stringify(record)).length+1;
    if(size+bytes>60000||events.length>=128)break;
    events.push(record);keys.push(key);size+=bytes;
  }
  try {port.postMessage({version:1,events});keys.forEach(key=>pending.delete(key));inFlight=true;lastSent=Date.now();}
  catch(error){lastError=error.message;port?.disconnect();port=null;inFlight=false;}
}
function queue(record){put(pending,JSON.stringify([record.address,record.port,record.hostname,record.site,record.phase]),record);}
async function seedSites(){for(const tab of await chrome.tabs.query({}))if(enabled&&!tab.incognito&&tab.url)put(sites,tab.id,hostName(tab.url));}
chrome.webRequest.onBeforeRequest.addListener(details=>{
  if(!enabled||blocked||details.incognito||details.tabId<0)return;
  if(details.type==='main_frame')put(sites,details.tabId,hostName(details.url));
},{urls:['<all_urls>']});
chrome.tabs.onRemoved.addListener(tabId=>sites.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId,changes,tab)=>{if(enabled&&!blocked&&!tab.incognito&&changes.url)put(sites,tabId,hostName(changes.url));});
chrome.webRequest.onResponseStarted.addListener(details=>{
  if(!enabled||blocked||details.incognito||!details.ip||details.fromCache)return;
  let url;try{url=new URL(details.url);}catch{return;}
  const hostname=hostName(details.url);if(!hostname)return;
  const record={hostname,address:details.ip,port:Number(url.port)||(url.protocol==='http:'||url.protocol==='ws:'?80:443),scheme:url.protocol.slice(0,-1),
    site:sites.get(details.tabId)||hostName(details.documentUrl)||hostName(details.initiator),resourceType:details.type,
    responseVersion:details.statusLine?.match(/^HTTP\/[^ ]+/)?.[0]||null,phase:'active',seenAt:Date.now(),security:null,
    proxyMode,proxied:!['direct','system'].includes(proxyMode)};
  put(active,details.requestId,{record,startedAt:Date.now()});queue(record);
},{urls:['<all_urls>']});
function finish(details,phase) {
  const request=active.get(details.requestId);
  if(request&&enabled&&!blocked&&!details.incognito)queue({...request.record,phase,seenAt:Date.now()});
  active.delete(details.requestId);tls.delete(details.requestId);
}
chrome.webRequest.onCompleted.addListener(details=>finish(details,'completed'),{urls:['<all_urls>']});
chrome.webRequest.onErrorOccurred.addListener(details=>finish(details,'error'),{urls:['<all_urls>']});
setInterval(flush,2000);
setInterval(()=>{
  if(!enabled||blocked)return;
  for(const [key,request] of active){if(Date.now()-request.startedAt>3600000)active.delete(key);else queue({...request.record,seenAt:Date.now()});}
},15000);
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  (async()=>{
  if(message?.action==='toggle') {
    enabled=!enabled;await chrome.storage.local.set({enabled});
    if(!enabled){port?.disconnect();port=null;active.clear();pending.clear();tls.clear();sites.clear();received=false;chrome.action.setBadgeText({text:'OFF'});}else {await seedSites();connect();}
  }
  return {enabled,connected:received&&!blocked,error:lastError,active:active.size};
  })().then(sendResponse,error=>sendResponse({enabled,connected:false,error:error.message,active:0}));
  return true;
});
chrome.storage.local.get('enabled').then(async settings=>{
  enabled=settings.enabled!==false;
  // Only currently open, ordinary tabs; never consult browsing history.
  if(enabled){await seedSites();connect();}else chrome.action.setBadgeText({text:'OFF'});
});

// Alarms wake a suspended MV3 worker when the native host is unavailable.
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='netkonnect-reconnect'){refreshProxy();flush();}});
chrome.alarms.create('netkonnect-reconnect',{periodInMinutes:0.5});

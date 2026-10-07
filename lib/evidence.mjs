import {addressKey,parseAddress,inPrefix,parsePrefix} from '../public/address.js';
import {appIdentity} from '../public/brands.js';

export const browserNames={firefox:'Firefox',chrome:'Chrome',edge:'Edge'};
export const hostname = value => {
  if (typeof value !== 'string' || value.length > 253 || /[/:@?#\s]/.test(value)) return null;
  const name=value.toLowerCase().replace(/\.$/,'');
  return name && name.split('.').every(label=>/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label)) ? name : null;
};
const text=(value,max=160)=>typeof value==='string'?value.replace(/[\x00-\x1f]/g,'').slice(0,max):null;
const security=value=>{
  if (!value || typeof value!=='object') return null;
  const result={};
  for(const key of ['state','protocolVersion','cipherSuite','certificateIssuer','certificateSubject']) if(text(value[key]))result[key]=text(value[key]);
  for(const key of ['usedPrivateDns','usedEch','isUntrusted','isDomainMismatch','isNotValidAtThisTime']) if(typeof value[key]==='boolean')result[key]=value[key];
  return result;
};
const observedAt=(value,now)=>{const at=typeof value==='string'?Date.parse(value):value===undefined?now:Number(value);return Number.isFinite(at)&&at<=now+5000&&at>=now-120000?at:null;};
export function browserRecord(input,now=Date.now(),source='firefox') {
  if (!Object.hasOwn(browserNames,source))throw new Error('Invalid browser source.');
  if (!input || typeof input!=='object' || input.incognito===true) throw new Error('Invalid browser observation.');
  const host=hostname(input.hostname), address=parseAddress(input.address), port=Number(input.port), seenAt=Number(input.seenAt);
  if (!host || !address || !Number.isInteger(port) || port<1 || port>65535 || !Number.isFinite(seenAt) || seenAt>now+5000 || now-seenAt>120000)
    throw new Error('Browser observation needs a recent hostname, server IP and port.');
  if (!['http','https','ws','wss'].includes(input.scheme) || !['active','completed','error'].includes(input.phase)) throw new Error('Invalid browser transport.');
  // Whitelist only metadata. URLs, bodies, headers, titles and request IDs never
  // enter the collector/journal, even if an extension submits additional fields.
  return {source,hostname:host,address:address.key,port,scheme:input.scheme,site:hostname(input.site),
    resourceType:text(input.resourceType,32),httpVersion:source==='firefox'?text(input.httpVersion,24):null,responseVersion:source==='firefox'?null:text(input.responseVersion,24),phase:input.phase,seenAt,
    receivedAt:now,expiresAt:now+(input.phase==='active'?45000:15000),security:source==='firefox'?security(input.security):null,
    proxied:input.proxied===true,proxyMode:source==='firefox'?null:['direct','system','fixed_servers','pac_script','auto_detect'].includes(input.proxyMode)?input.proxyMode:'unknown'};
}

export class EvidenceStore {
  constructor({browserEnabled=false,browsers={},maxRecords=10000}={}) {this.browserEnabled=browserEnabled;this.browsers={firefox:browserEnabled,chrome:browsers.chrome===true,edge:browsers.edge===true};this.maxRecords=maxRecords;this.records=new Map();this.sources={};this.dropped=0;this.revision=0;this.indexRevision=-1;}
  status(source,available,message='',now=Date.now()) {this.sources[source]={available,message:text(message,300)||'',updatedAt:now};}
  prune(now) {for(const [key,r] of this.records)if(r.expiresAt<=now){this.records.delete(key);this.revision++;}}
  put(key,record) {if(!this.records.has(key)&&this.records.size>=this.maxRecords){this.records.delete(this.records.keys().next().value);this.dropped++;}this.records.set(key,record);this.revision++;}
  index() {if(this.indexRevision===this.revision)return this.byAddress;this.byAddress=new Map();for(const r of this.records.values()){if(!this.byAddress.has(r.address))this.byAddress.set(r.address,[]);this.byAddress.get(r.address).push(r);}this.indexRevision=this.revision;return this.byAddress;}
  browserBatch(input,now=Date.now()) {
    if (input?.version!==1 || !Array.isArray(input.events) || input.events.length>128) throw new Error('Invalid browser evidence batch.');
    const source=input.source??'firefox';if(!Object.hasOwn(browserNames,source))throw new Error('Invalid browser source.');
    const enabled=this.browsers[source];
    const records=input.events.map(record=>browserRecord(record,now,source));
    this.status(source,enabled,enabled?'Connected locally':'Browser observations are paused',now);
    if (!enabled) return {accepted:0,enabled:false};
    this.prune(now);
    for(const r of records)this.put(JSON.stringify([r.source,r.address,r.port,r.hostname,r.site,r.proxied]),r);
    return {accepted:records.length,enabled:true};
  }
  nativeBatch(batch,now=Date.now()) {
    if(batch.type==='evidence-status'){this.status(batch.source,batch.available===true,batch.message,now);return true;}
    if(batch.type==='connection-evidence') {
      for(const input of (batch.records||[]).slice(0,1024)) {
        const address=parseAddress(input.remoteAddress),local=parseAddress(input.localAddress),pid=Number(input.pid),seenAt=observedAt(input.seenAt,now);
        if(!address||!local||seenAt===null||!Number.isInteger(pid)||pid<=0||!['TCP','UDP'].includes(input.protocol)||!['blocked','permitted'].includes(input.outcome))continue;
        const r={source:'wfp-audit',address:address.key,localAddress:local.key,pid,protocol:input.protocol,localPort:Number(input.localPort),remotePort:Number(input.remotePort),outcome:input.outcome,eventId:Number(input.eventId),seenAt,expiresAt:seenAt+60000};
        this.put(JSON.stringify([r.source,r.address,r.localAddress,pid,r.protocol,r.localPort,r.remotePort,r.outcome]),r);
      }
      this.status('wfp-audit',true,'Existing Windows firewall audit records',now);return true;
    }
    if(batch.type!=='name-evidence')return false;
    this.prune(now);
    for(const input of (batch.records||[]).slice(0,1024)) {
      const name=hostname(input.hostname), pid=Number(input.pid), addresses=(input.addresses||[]).map(parseAddress).filter(Boolean),seenAt=observedAt(input.seenAt,now);
      if(!name||seenAt===null||!Number.isInteger(pid)||pid<0)continue;
      for(const address of addresses) {
        const r={source:'windows-dns-etw',hostname:name,address:address.key,pid,seenAt,expiresAt:seenAt+60000,queryType:Number(input.queryType)||null};
        this.put(JSON.stringify([r.source,r.address,pid,name]),r);
      }
    }
    this.status('windows-dns-etw',true,'',now);return true;
  }
  annotate(c,now=Date.now()) {
    const address=addressKey(c.remoteAddress), ownerStart=Date.parse(c.owner?.startedAt), browser=[],dns=[],firewall=[];
    for(const r of this.index().get(address)||[]) {
      if(r.expiresAt<=now||r.address!==address)continue;
      if(Object.hasOwn(browserNames,r.source) && appIdentity(c.app).key===r.source && !/webview/i.test(c.app) && r.port===Number(c.remotePort) && !r.proxied
        && !(r.source==='firefox'&&r.httpVersion==='HTTP/3'&&c.protocol!=='UDP')
        && (r.source==='firefox'||r.proxyMode==='direct'||(r.proxyMode==='system'&&this.systemProxy?.known===true&&this.systemProxy.configured===false)))browser.push(r);
      if(r.source==='windows-dns-etw' && r.pid===c.pid && r.pid>0 && (!Number.isFinite(ownerStart)||r.seenAt>=ownerStart))dns.push(r);
      if(r.source==='wfp-audit' && r.pid===c.pid && r.protocol===c.protocol && r.localAddress===addressKey(c.localAddress)
        && r.localPort===Number(c.localPort) && r.remotePort===Number(c.remotePort) && (!Number.isFinite(ownerStart)||r.seenAt>=ownerStart))firewall.push(r);
    }
    return {...c,browserEvidence:browser.slice(-32),dnsEvidence:dns.slice(-32),firewallEvidence:firewall.slice(-16)};
  }
  snapshot(snapshot,now=Date.now()) {
    if(!snapshot)return snapshot;
    this.systemProxy=snapshot.systemProxy;
    this.prune(now);
    return {...snapshot,connections:(snapshot.connections||[]).map(c=>this.annotate(c,now)),
      evidence:{sources:{...snapshot.collectionSources,...this.sources},browserEnabled:this.browserEnabled,browsers:{...this.browsers},records:this.records.size,dropped:this.dropped,
        browserRequests:[...this.records.values()].filter(r=>Object.hasOwn(browserNames,r.source)).slice(-64),
        firewallEvents:[...this.records.values()].filter(r=>r.source==='wfp-audit').slice(-64)}};
  }
  setBrowserEnabled(enabled,source='firefox') {
    if(!Object.hasOwn(browserNames,source))throw new Error('Invalid browser source.');
    if(typeof enabled!=='boolean')throw new Error('Invalid browser preference.');
    this.browsers[source]=enabled;if(source==='firefox')this.browserEnabled=enabled;
    this.status(source,false,enabled?`Waiting for the ${browserNames[source]} extension`:'Browser observations are paused');
    if(!enabled)for(const [key,r] of this.records)if(r.source===source){this.records.delete(key);this.revision++;}
  }
}

// A routing-table match is an OS routing decision clue, not a packet path trace.
export function connectionPath(c,snapshot) {
  const local=addressKey(c.localAddress), adapter=(snapshot.adapters||[]).find(a=>[...(a.ipv4||[]),...(a.ipv6||[])].some(ip=>addressKey(ip)===local));
  const remote=parseAddress(c.remoteAddress);
  const routes=(snapshot.routes||[]).filter(r=>!adapter||r.interfaceIndex===adapter.interfaceIndex).flatMap(r=>{
    try {const prefix=parsePrefix(r.destinationPrefix);return inPrefix(remote,prefix)?[{...r,prefixLength:prefix.length}]:[];}catch{return [];}
  }).sort((a,b)=>b.prefixLength-a.prefixLength||(a.routeMetric+a.interfaceMetric)-(b.routeMetric+b.interfaceMetric));
  const route=routes[0],selectedAdapter=adapter||(snapshot.adapters||[]).find(a=>a.interfaceIndex===route?.interfaceIndex);
  const nextHop=parseAddress(route?.nextHop),neighborAddress=nextHop?.value===0n?c.remoteAddress:route?.nextHop;
  const neighbor=(snapshot.neighbors||[]).find(n=>n.interfaceIndex===(selectedAdapter?.interfaceIndex||route?.interfaceIndex)&&addressKey(n.address)===addressKey(neighborAddress));
  return {adapter:selectedAdapter?.name||null,interfaceIndex:selectedAdapter?.interfaceIndex||route?.interfaceIndex||null,
    nextHop:route?.nextHop||null,destinationPrefix:route?.destinationPrefix||null,dnsServers:selectedAdapter?.dns||[],neighbor:neighbor||null};
}

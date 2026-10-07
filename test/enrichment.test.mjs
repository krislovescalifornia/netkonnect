import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EvidenceStore,browserRecord,connectionPath} from '../lib/evidence.mjs';
import {EnhancedLookup} from '../lib/enhanced-lookup.mjs';
import {serviceIdentity,transportHint} from '../public/service-evidence.js';
import {TrafficStore} from '../lib/traffic.mjs';
import {AnalyticsStore} from '../lib/analytics.mjs';
import {enrichSnapshot} from '../lib/network.mjs';
import {enrichmentPreferences,evidenceDetails} from '../public/enrichment.js';
import {packageFirefox} from '../scripts/package-firefox.mjs';

const now=Date.now(),ip='2001:1890:1d10:6600::c';
const c={app:'firefox',pid:10,protocol:'UDP',scope:'Internet',localAddress:'192.168.1.2',localPort:50000,remoteAddress:ip,remotePort:443};
const request={hostname:'rr1.googlevideo.com',address:ip,port:443,scheme:'https',site:'tv.youtube.com',resourceType:'media',httpVersion:'HTTP/3',phase:'active',seenAt:now,security:{protocolVersion:'TLSv1.3',usedPrivateDns:true,certificateIssuer:'CN=Example CA'}};
const batch=(at,flow)=>({type:'traffic',elapsed:2,timestamp:new Date(at).toISOString(),flows:[{...flow,receivedBytes:100,sentBytes:10}]});
const snapshot={connections:[],processes:{10:'firefox'},adapters:[],dnsRecords:[]};

test('browser bridge defaults off; metadata whitelist excludes private windows and content',()=>{
  const store=new EvidenceStore();assert.equal(store.browserBatch({version:1,events:[request]},now).accepted,0);assert.equal(store.records.size,0);
  const record=browserRecord({...request,url:'https://example.test/private?q=secret',headers:['secret'],title:'private title',requestId:'private ID'},now);
  for(const key of ['url','headers','title','requestId'])assert.equal(key in record,false);
  assert.throws(()=>browserRecord({...request,incognito:true},now));assert.throws(()=>browserRecord({...request,hostname:'example.test/path'},now));
  assert.throws(()=>browserRecord({...request,seenAt:now-120001},now));
  assert.throws(()=>store.browserBatch({version:1,events:Array(129).fill(request)},now));
});

test('Firefox endpoint correlation expires, respects proxies, protocols and application boundaries',()=>{
  const store=new EvidenceStore({browserEnabled:true});store.browserBatch({version:1,events:[request]},now);
  const enriched=store.annotate(c,now);assert.equal(enriched.browserEvidence.length,1);assert.equal(serviceIdentity(enriched).label,'YouTube TV');
  assert.match(serviceIdentity(enriched).explanation,/does not expose the local socket/);assert.match(transportHint(enriched),/HTTP\/3.*TLSv1.3/);
  assert.equal(store.annotate({...c,app:'chrome'},now).browserEvidence.length,0);
  assert.equal(store.annotate({...c,remotePort:80},now).browserEvidence.length,0);
  assert.equal(store.annotate({...c,protocol:'TCP'},now).browserEvidence.length,0);
  assert.equal(store.annotate(c,now+45000).browserEvidence.length,0);
  store.browserBatch({version:1,events:[{...request,proxied:true}]},now);store.setBrowserEnabled(false);assert.equal(store.records.size,0);
  const proxy=new EvidenceStore({browserEnabled:true});proxy.browserBatch({version:1,events:[{...request,proxied:true}]},now);assert.equal(proxy.annotate(c,now).browserEvidence.length,0);
});

test('shared browser destinations remain uncertain and process DNS never transfers across PIDs',()=>{
  const store=new EvidenceStore({browserEnabled:true});store.browserBatch({version:1,events:[request,{...request,hostname:'unrelated.example',site:'unrelated.example'}]},now);
  assert.equal(serviceIdentity(store.annotate(c,now)).kind,'ambiguous');
  store.setBrowserEnabled(false);store.nativeBatch({type:'name-evidence',records:[{hostname:'tv.youtube.com',pid:10,addresses:[ip],queryType:28}]},now);
  assert.equal(serviceIdentity(store.annotate(c,now)).confidence,'Process DNS event clue');
  assert.equal(store.annotate({...c,pid:11},now).dnsEvidence.length,0);
  assert.equal(store.annotate({...c,owner:{startedAt:new Date(now+1).toISOString()}},now+1).dnsEvidence.length,0);
  assert.equal(store.annotate(c,now+60000).dnsEvidence.length,0);
  store.nativeBatch({type:'name-evidence',records:[{hostname:'old.example',pid:10,addresses:[ip],seenAt:now-10000}]},now);
  assert.equal(store.annotate({...c,owner:{startedAt:new Date(now-5000).toISOString()}},now).dnsEvidence.length,1);
  assert.ok(!store.annotate({...c,owner:{startedAt:new Date(now-5000).toISOString()}},now).dnsEvidence.some(r=>r.hostname==='old.example'));
});

test('routing and firewall clues preserve exact tuples and show the local next-hop neighbor',()=>{
  const path=connectionPath(c,{adapters:[{name:'Ethernet',interfaceIndex:3,ipv4:[c.localAddress],dns:['192.168.1.1']}],routes:[{destinationPrefix:'::/0',nextHop:'fe80::1',interfaceIndex:3,routeMetric:10,interfaceMetric:10},{destinationPrefix:'2001:1890::/29',nextHop:'fe80::2',interfaceIndex:3,routeMetric:20,interfaceMetric:10}],neighbors:[{address:'fe80::2',interfaceIndex:3,mac:'AA-BB-CC-DD-EE-FF',state:'Reachable'}]});
  assert.equal(path.nextHop,'fe80::2');assert.equal(path.adapter,'Ethernet');assert.equal(path.neighbor.mac,'AA-BB-CC-DD-EE-FF');
  const store=new EvidenceStore();store.nativeBatch({type:'connection-evidence',records:[{...c,outcome:'blocked',eventId:5157}]},now);
  assert.equal(store.annotate(c,now).firewallEvidence.length,1);assert.equal(store.annotate({...c,localPort:50001},now).firewallEvidence.length,0);
});

test('new evidence does not relabel earlier hourly bytes and PID reuse discards old socket clues',()=>{
  const store=new TrafficStore();store.ingest(batch(now,c),now,snapshot);
  const browser=[browserRecord(request,now)];store.ingest(batch(now+2000,{...c,browserEvidence:browser}),now+2000,snapshot);
  const decorated=store.decorate(snapshot,now+2000);assert.equal(decorated.traffic.usageConnections.length,2);
  const identified=decorated.traffic.usageConnections.find(r=>serviceIdentity(r).key==='youtube-tv');assert.equal(identified.receivedBytes60m,100);
  assert.equal(decorated.traffic.usageConnections.reduce((n,r)=>n+r.receivedBytes60m,0),200);
  const history=new AnalyticsStore('unused');history.ingest(batch(now,c),now,snapshot);history.ingest(batch(now+2000,{...c,browserEvidence:browser}),now+2000,snapshot);
  const records=[...history.days.values()][0];assert.equal(records.size,2);assert.equal([...records.values()].find(r=>r.service.key==='youtube-tv').received,100);
  assert.equal([...records.values()].find(r=>r.service.key==='youtube-tv').evidence[0].site,'tv.youtube.com');
  const raw={timestamp:new Date(now).toISOString(),connections:[c],adapters:[],dns:[{name:'tv.youtube.com',address:ip}],processDetails:{10:{startedAt:new Date(now-1000).toISOString()}}};
  const first=enrichSnapshot(raw,null),second=enrichSnapshot({...raw,timestamp:new Date(now+2000).toISOString(),dns:[],processDetails:{10:{startedAt:new Date(now+1000).toISOString()}}},first);
  assert.deepEqual(second.connections[0].domainCandidates,[]);
});

test('Enhanced Lookup makes no requests by default, rejects nonpublic inputs, and caches explicit requests',async()=>{
  let calls=0;const lookup=new EnhancedLookup('unused',{run:async address=>{calls++;return {address,hostnames:['edge.example'],network:{name:'Example allocation'},lookedUpAt:new Date(now).toISOString()};}});
  await assert.rejects(lookup.lookup('8.8.8.8'),/Turn on/);assert.equal(calls,0);lookup.setEnabled(true);
  for(const address of ['127.0.0.1','10.0.0.1','::1','0:0:0:0:0:0:0:1','::','fe80::1','fd00::1','224.0.0.1','255.255.255.255','0.1.2.3','https://example.test','8.8.8.8;whoami'])await assert.rejects(lookup.lookup(address),/public destination/);
  const result=await lookup.lookup('8.8.8.8');assert.deepEqual(result.hostnames,['edge.example']);await lookup.lookup('::ffff:8.8.8.8');assert.equal(calls,1);
  lookup.setEnabled(false);assert.equal(lookup.results.size,0);assert.equal(lookup.annotate({...c,remoteAddress:'8.8.8.8'}).enhancedLookup,null);
});

test('lookup concurrency is bounded and disabling it prevents late results from entering the cache',async()=>{
  const finish=[];const lookup=new EnhancedLookup('unused',{run:()=>new Promise(resolve=>finish.push(resolve))});lookup.setEnabled(true);
  const one=lookup.lookup('8.8.8.8'),two=lookup.lookup('1.1.1.1');await assert.rejects(lookup.lookup('9.9.9.9'),/Two lookups/);
  lookup.setEnabled(false);finish.forEach(resolve=>resolve({hostnames:[]}));await Promise.all([one,two]);assert.equal(lookup.results.size,0);
});

test('the add-on archive is reproducible and UI makes offline defaults and source limits explicit',async()=>{
  const existing=await readFile(new URL('../browser/netKonnect-Service-Insight.xpi',import.meta.url));assert.ok((await packageFirefox(undefined,{write:false})).equals(existing),'Packaged Firefox archive must match its reviewed source.');
  const manifest=JSON.parse(await readFile(new URL('../browser/firefox/manifest.json',import.meta.url),'utf8'));assert.equal(manifest.incognito,'not_allowed');assert.ok(manifest.permissions.includes('nativeMessaging'));assert.ok(!manifest.permissions.includes('history'));assert.equal(manifest.content_scripts,undefined);
  const prefs=enrichmentPreferences({browser:false,enhancedLookup:false},String);assert.match(prefs,/Off by default/);assert.match(prefs,/unsigned/);assert.match(prefs,/aria-checked="false"/);
  const details=evidenceDetails({...c,browserEvidence:[browserRecord(request,now)]},{esc:String},{enrichment:{enhancedLookup:false}});assert.match(details,/TLSv1.3/);assert.match(details,/tv.youtube.com/);assert.match(details,/per-tab bytes are unavailable/);assert.doesNotMatch(details,/data-lookup-address/);
});

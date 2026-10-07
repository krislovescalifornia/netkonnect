import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostsRecords,ptrAddress,dnsIndex,netbiosRecords} from '../lib/dns.mjs';
import {enrichSnapshot,scope} from '../lib/network.mjs';
import {TrafficStore} from '../lib/traffic.mjs';
import {AnalyticsStore} from '../lib/analytics.mjs';
import {SQLiteHistory} from '../lib/sqlite-history.mjs';
import {EvidenceStore,connectionPath} from '../lib/evidence.mjs';
import {evidenceDetails,sourceDetails} from '../public/enrichment.js';
import {serviceIdentity} from '../public/service-evidence.js';
import {coverageRibbon} from '../public/companion-ui.js';
import {DatabaseSync} from 'node:sqlite';

const now=Date.parse('2026-10-07T04:00:00Z');
const flow={pid:123,protocol:'TCP',localAddress:'192.168.1.2',localPort:50000,remoteAddress:'8.8.8.8',remotePort:443,receivedBytes:0,sentBytes:0};
const batch=(flows,at=now)=>({type:'traffic',elapsed:2,timestamp:new Date(at).toISOString(),flows});
const oldOwner={name:'brief-app',startedAt:new Date(now-1000).toISOString(),source:'process-etw',parentPid:42};
const newOwner={name:'reused-pid',startedAt:new Date(now+1000).toISOString()};

test('local hosts aliases and already cached IPv4/IPv6 PTR names enrich without resolver calls',()=>{
  const hosts=hostsRecords(['#comment','8.8.8.8 Alpha.example beta.example # ignore.example','::1 localhost','bad invalid','1.2.3.4 https://bad/path']);
  assert.equal(hosts.length,3);
  assert.deepEqual([...dnsIndex(hosts).get('8.8.8.8')],['alpha.example','beta.example']);
  assert.equal(ptrAddress('8.8.8.8.in-addr.arpa.'),'8.8.8.8');
  assert.equal(ptrAddress('1.2.3.in-addr.arpa'),null);
  assert.equal(ptrAddress('999.2.3.4.in-addr.arpa'),null);
  const reverse='1.'+'0.'.repeat(31)+'ip6.arpa';
  assert.equal(ptrAddress(reverse),'0000:0000:0000:0000:0000:0000:0000:0001');
  assert.equal(ptrAddress(reverse.replace('1.','z.')),null);
  const records=[{name:'8.8.8.8.in-addr.arpa',target:'resolver.example',type:12,ttl:3}];
  assert.deepEqual([...dnsIndex(records).get('8.8.8.8')],['resolver.example']);
  const first=enrichSnapshot({timestamp:new Date(now).toISOString(),adapters:[],connections:[flow],hosts:['8.8.8.8 local.example'],dns:records},null);
  assert.deepEqual(first.connections[0].domainCandidates,['resolver.example','local.example']);
  const second=enrichSnapshot({timestamp:new Date(now+4000).toISOString(),adapters:[],connections:[],hosts:[],dns:[]},first);
  assert.equal(second.dnsRecords.length,0,'Removed hosts entries and expired PTR records leave the cache');
});

test('multicast/broadcast scope and missing adapter counters cannot masquerade as measured Internet usage',()=>{
  for(const ip of ['224.0.0.1','239.255.255.250','255.255.255.255','ff02::fb'])assert.equal(scope(ip),'Local');
  const raw={timestamp:new Date(now).toISOString(),adapters:[{id:'a',status:'Up',receivedBytes:null,sentBytes:null}],connections:[]};
  const first=enrichSnapshot(raw,null),second=enrichSnapshot({...raw,timestamp:new Date(now+8000).toISOString()},first);
  assert.equal(second.adapters[0].receiveRate,null);assert.equal(second.totals.ready,false);
  const initialized=enrichSnapshot({...raw,timestamp:new Date(now+16000).toISOString(),adapters:[{id:'a',status:'Up',receivedBytes:100,sentBytes:100}]},second);
  assert.equal(initialized.adapters[0].receiveRate,null,'A first readable counter needs a baseline');
});

test('NetBIOS cache reads preserve only unique computer/server aliases and their observed lifetimes',()=>{
  const lines=['NAS <20> UNIQUE 192.168.1.10 120','NAS <00> UNIQUE 192.168.1.10 120','WORKGROUP <00> GROUP 192.168.1.10 120','USER <03> UNIQUE 192.168.1.10 120','BAD <20> UNIQUE 999.0.0.1 120'];
  assert.equal(netbiosRecords(lines).length,2);
  const raw={timestamp:new Date(now).toISOString(),connections:[{...flow,remoteAddress:'192.168.1.10'}],adapters:[],dns:[],netbiosCache:lines};
  const first=enrichSnapshot(raw,null);
  assert.deepEqual(first.connections[0].domainCandidates,['nas']);
  assert.equal(serviceIdentity(first.connections[0]).confidence,'Local name clue');
  const traffic=new TrafficStore();traffic.ingest(batch([{...flow,remoteAddress:'192.168.1.10',receivedBytes:10}]),now,first);
  assert.equal(serviceIdentity(traffic.decorate(first,now).connections[0]).confidence,'Local name clue');
  const expired=enrichSnapshot({...raw,timestamp:new Date(now+121000).toISOString(),connections:[],netbiosCache:[]},first);
  assert.equal(expired.dnsRecords.length,0);
});

test('ETW lifecycle-only connections remain visible while bytes and retransmissions stay separate',()=>{
  const store=new TrafficStore(),snapshot={connections:[],adapters:[],processes:{},dnsRecords:[]};
  store.ingest({...batch([{...flow,owner:oldOwner,etwState:'Disconnected',transportEvents:{connected:1,disconnected:1,retransmitted:2,retransmittedBytes:1200}}]),eventsLost:1,buffersLost:2,collectorDropped:3,malformedEvents:4,unsupportedEvents:5},now,snapshot);
  const result=store.decorate(snapshot,now),c=result.connections[0];
  assert.equal(c.app,'brief-app');assert.equal(c.state,'Disconnected');assert.equal(c.owner.parentPid,42);
  assert.equal(c.sentBytes,0);assert.equal(c.transportEvents.retransmittedBytes,1200);
  assert.equal(result.traffic.usageConnections.length,0);
  assert.equal(result.traffic.eventsLost,1);assert.equal(result.traffic.buffersLost,2);assert.equal(result.traffic.collectorDropped,3);
  const html=evidenceDetails(c,{esc:String},result);assert.match(html,/Parent PID/);assert.match(html,/separate from usage/);
});

test('captured owners beat a reused PID in stale socket snapshots and saved usage',()=>{
  const snapshot={connections:[{...flow,app:'reused-pid',owner:newOwner,domainCandidates:['unrelated.example']}],processes:{123:'reused-pid'},processDetails:{123:newOwner},dnsRecords:[],adapters:[]};
  const captured={...flow,owner:oldOwner,sentBytes:120,receivedBytes:30};
  const traffic=new TrafficStore();traffic.ingest(batch([captured]),now,snapshot);
  const c=traffic.decorate(snapshot,now).connections[0];
  assert.equal(c.app,'brief-app');assert.deepEqual(c.domainCandidates,[]);assert.equal(c.owner.startedAt,oldOwner.startedAt);
  const history=new AnalyticsStore('unused');history.ingest(batch([captured]),now,snapshot);
  const record=[...history.days.values()][0].values().next().value;
  assert.equal(record.app,'brief-app');assert.deepEqual(record.hostnames,[]);assert.equal(record.sent,120);
});

test('on-link route uses the destination neighbor and wildcard bindings select a route adapter',()=>{
  const snapshot={adapters:[{name:'LAN',interfaceIndex:4,ipv4:['192.168.1.2'],dns:['192.168.1.1']}],routes:[{destinationPrefix:'192.168.1.0/24',nextHop:'0.0.0.0',interfaceIndex:4,routeMetric:1,interfaceMetric:10}],neighbors:[{address:'192.168.1.10',interfaceIndex:4,mac:'AA-BB-CC-DD-EE-FF',state:'Reachable'}]};
  const path=connectionPath({...flow,localAddress:'0.0.0.0',remoteAddress:'192.168.1.10'},snapshot);
  assert.equal(path.adapter,'LAN');assert.equal(path.neighbor.address,'192.168.1.10');assert.deepEqual(path.dnsServers,['192.168.1.1']);
});

test('snapshot source counts distinguish empty successful reads from unavailable sources',()=>{
  const snapshot=new EvidenceStore().snapshot({connections:[],collectionSources:{'hosts-file':{available:true,count:0,updatedAt:now,message:'No entries'},'routing-table':{available:false,count:0,updatedAt:now,message:'Denied'}},networkStatistics:{IPv4:{icmp:{messagesReceived:12,messagesSent:20}}}},now);
  const html=sourceDetails(snapshot,String);
  assert.match(html,/0 records read/);assert.match(html,/unavailable/);assert.match(html,/ICMP/);assert.match(html,/messagesReceived: 12/);
});

test('SQLite preserves short-lived, zero-byte ETW sightings across restart without invented usage',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'nk-os-audit-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const history=new SQLiteHistory(directory);await history.load(now);
  history.ingest({...batch([{...flow,owner:oldOwner,etwState:'Disconnected',transportEvents:{connected:1,disconnected:1}}]),eventsLost:3,buffersLost:2},now,{connections:[],adapters:[],processes:{}});
  await history.close();
  const reopened=new SQLiteHistory(directory);await reopened.load(now);
  try {
    const sightings=reopened.db.prepare('SELECT record FROM connection_sightings').all();
    assert.equal(sightings.length,1);const record=JSON.parse(sightings[0].record);
    assert.equal(record.app,'brief-app');assert.equal(record.trafficSource,'ETW');assert.equal(record.state,'Disconnected');
    assert.equal(reopened.query({range:'all'},now).total,0);
    const timeline=reopened.timeline(now-1);assert.equal(timeline[0].lostEvents,3);assert.equal(timeline[0].lostBuffers,2);
    assert.match(coverageRibbon(timeline,now+60000),/2 lost buffers/);
  } finally { await reopened.close(); }
});

test('loss-buffer migration preserves existing observation history and can reopen repeatedly',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'nk-os-migration-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const old=new DatabaseSync(join(directory,'history.sqlite'));
  old.exec('CREATE TABLE observation_minutes(at INTEGER PRIMARY KEY,snapshot_seconds REAL DEFAULT 0,capture_seconds REAL DEFAULT 0,lost_events INTEGER DEFAULT 0)');
  old.prepare('INSERT INTO observation_minutes VALUES(?,?,?,?)').run(now,8,2,3);old.close();
  for(let i=0;i<2;i++) {
    const history=new SQLiteHistory(directory);await history.load(now);
    try {assert.equal(history.timeline(now-1)[0].lostEvents,3);assert.equal(history.timeline(now-1)[0].lostBuffers,0);}
    finally {await history.close();}
  }
});

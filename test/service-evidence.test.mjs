import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addressKey,parseAddress,parsePrefix,inPrefix} from '../public/address.js';
import {networkIdentity,serviceIdentity,transportHint} from '../public/service-evidence.js';
import {dnsIndex,cachedDns} from '../lib/dns.mjs';
import {enrichSnapshot} from '../lib/network.mjs';
import {TrafficStore} from '../lib/traffic.mjs';
import {AnalyticsStore} from '../lib/analytics.mjs';
import {buildRoutes} from '../public/routes.js';
import {renderNetworkMap,routeDetails} from '../public/map.js';

const now=Date.now(), ip='2001:1890:1d10:6600::c';
const connection={app:'firefox',pid:10,protocol:'UDP',scope:'Internet',state:'Observed',localAddress:'192.168.1.2',localPort:50000,remoteAddress:ip,remotePort:443,receiveRate:800000,sendRate:3000};
const raw=(at,dns=[],connections=[])=>({timestamp:new Date(at).toISOString(),dns,connections,processes:{10:'firefox'},adapters:[]});
const batch=(at,c=connection)=>({type:'traffic',elapsed:2,timestamp:new Date(at).toISOString(),flows:[{...c,receivedBytes:1600000,sentBytes:6000}]});

test('equivalent IPv6 and mapped IPv4 spellings join; malformed addresses cannot match ranges',()=>{
  assert.equal(addressKey(ip),addressKey('2001:1890:1D10:6600:0000:0000:0000:000C'));
  assert.equal(addressKey('::ffff:8.8.8.8'),'8.8.8.8');
  assert.equal(addressKey('0:0:0:0:0:ffff:0808:0808'),'8.8.8.8');
  for(const value of ['2001::1890::1','2001:1890:1:2:3:4:5:6:7','104.16.0.256','104.016.0.1','2001:1890:x::1','not an IP']) assert.equal(parseAddress(value),null,value);
  const range=parsePrefix('2001:1890::/29');
  assert.ok(inPrefix(parseAddress('2001:1897:ffff:ffff:ffff:ffff:ffff:ffff'),range));
  assert.equal(inPrefix(parseAddress('2001:1898::'),range),false);
  assert.throws(()=>parsePrefix('2001:1890::/129'));
});

test('live Firefox destinations gain network hints without inventing YouTube TV or merging customers',()=>{
  for(const [address,provider] of [[ip,'AT&T'],['2607:f8b0:4023:1433::88','Google'],['34.107.243.93','Google'],['2a06:98c1:52::4','Cloudflare']]) {
    const service=serviceIdentity({...connection,remoteAddress:address});
    assert.equal(service.network.name,provider);
    assert.equal(service.kind,'infrastructure');
    assert.equal(service.key,address);
    assert.match(service.label,/service unknown/);
    assert.doesNotMatch(service.label,/YouTube/);
    assert.match(service.network.source,/^https:/);
  }
  assert.equal(networkIdentity('2a06:98c8::1'),null);
  assert.equal(serviceIdentity({...connection,domainCandidates:['tv.youtube.com']}).label,'YouTube TV');
  const video=serviceIdentity({...connection,domainCandidates:['rr1.googlevideo.com']});
  assert.equal(video.label,'YouTube · video CDN');
  assert.match(video.explanation,/YouTube and YouTube TV share/);
  const routes=buildRoutes([connection,{...connection,remoteAddress:'2001:1890:1d10:6600::d'}]);
  assert.equal(routes.length,2);
  assert.equal(routes.reduce((sum,r)=>sum+r.receiveRate,0),1600000);
});

test('passive aliases follow bounded chains, retain shared-IP conflicts, and obey TTL expiration',()=>{
  const records=[{name:'tv.youtube.com',target:'alias.example',ttl:30},{name:'alias.example',target:'edge.example',ttl:30},
    {name:'edge.example',address:ip,ttl:60},{name:'other.example',address:ip,ttl:60},
    {name:'cycle.example',target:'cycle2.example',ttl:20},{name:'cycle2.example',target:'cycle.example',ttl:20}];
  const cached=cachedDns(records,[],new Date(now).toISOString());
  const names=[...dnsIndex(cached).get(addressKey(ip))];
  assert.ok(names.includes('tv.youtube.com'));
  assert.ok(names.includes('other.example'));
  assert.equal(serviceIdentity({...connection,domainCandidates:names}).confidence,'Ambiguous DNS');
  const later=cachedDns([],cached,new Date(now+31000).toISOString());
  assert.equal(later.length,2);
  assert.equal([...dnsIndex(later).get(addressKey(ip))].includes('tv.youtube.com'),false);
  assert.equal(cachedDns([],cached,new Date(now+60000).toISOString()).length,0);
  assert.equal(cachedDns([],[{name:'old.example',address:ip}],new Date(now).toISOString()).length,0);
});

test('a continuous TCP connection keeps earlier names; recreated sockets do not inherit them',()=>{
  const tcp={...connection,protocol:'TCP',state:'Established'};
  const first=enrichSnapshot(raw(now,[{name:'tv.youtube.com',address:ip}], [tcp]),null);
  const second=enrichSnapshot(raw(now+8000,[],[tcp]),first);
  assert.deepEqual(second.connections[0].domainCandidates,['tv.youtube.com']);
  assert.equal(serviceIdentity(second.connections[0]).confidence,'Earlier DNS clue');
  const missing=enrichSnapshot(raw(now+16000),second);
  const recreated=enrichSnapshot(raw(now+24000,[],[tcp]),missing);
  assert.deepEqual(recreated.connections[0].domainCandidates,[]);
  const conflict=enrichSnapshot(raw(now+16000,[{name:'unrelated.example',address:ip}],[tcp]),second);
  assert.equal(serviceIdentity(conflict.connections[0]).kind,'ambiguous');
});

test('UDP flows and saved analytics use canonical DNS joins; earlier flow clues survive cache loss',()=>{
  const snapshot=enrichSnapshot(raw(now,[{name:'rr1.googlevideo.com',address:'2001:1890:1D10:6600:0:0:0:C'}]),null);
  const store=new TrafficStore();store.ingest(batch(now),now,snapshot);
  assert.equal(serviceIdentity(store.decorate(snapshot,now).connections[0]).key,'youtube-video');
  const empty=enrichSnapshot(raw(now+8000),snapshot);
  store.ingest(batch(now+8000),now+8000,empty);
  const decorated=store.decorate(empty,now+8000);
  assert.equal(serviceIdentity(decorated.connections[0]).confidence,'Earlier DNS clue');
  assert.equal(decorated.traffic.usageConnections[0].receivedBytes60m,3200000);
  const analytics=new AnalyticsStore('unused');analytics.ingest(batch(now),now,snapshot);
  assert.equal([...analytics.days.values()][0].values().next().value.service.key,'youtube-video');
});

test('empty hostname arrays cannot suppress newer DNS evidence on an ETW peer',()=>{
  const snapshot=enrichSnapshot(raw(now,[{name:'tv.youtube.com',address:ip}],[connection]),null);
  snapshot.connections[0].domainCandidates=[];
  const store=new TrafficStore();store.ingest(batch(now),now,snapshot);
  assert.equal(serviceIdentity(store.decorate(snapshot,now).connections[0]).key,'youtube-tv');
  const analytics=new AnalyticsStore('unused');analytics.ingest(batch(now),now,snapshot);
  assert.equal([...analytics.days.values()][0].values().next().value.service.key,'youtube-tv');
});

test('destination UI explains unidentified and provider-only traffic and keeps exact IPs available',()=>{
  const connections=[connection,{...connection,remoteAddress:'203.0.113.17',protocol:'TCP'}];
  const state={snapshot:{connections,traffic:{available:true}},mode:'live',mapApp:'all',mapQuery:'',mapDetail:'service',mapLimit:10,mapSort:'total',mapSortDirection:'desc',mapVehicle:'auto',motion:false,mapExpanded:new Set(['firefox'])};
  const helpers={esc:String,rate:String,bytes:String,icon:()=>''};
  const html=renderNetworkMap({state,...helpers});
  assert.doesNotMatch(html,/Destination insight|service-insight|source-status-card/);
  assert.match(html,/AT&T network · service unknown/);
  assert.match(html,/Unidentified service/);
  assert.match(html,/203.0.113.17:443/);
  const details=routeDetails(buildRoutes(connections).find(r=>r.endpoint.remoteAddress===ip),helpers,state.snapshot);
  assert.match(details,/What this destination tells us/);
  assert.match(details,/Possible QUIC/);
  assert.match(details,/Network source/);
  assert.match(transportHint(connection),/port alone cannot identify/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TrafficStore,USAGE_WINDOW_MS} from '../lib/traffic.mjs';
import {enrichSnapshot} from '../lib/network.mjs';
import {buildRoutes,serviceIdentity,fleet} from '../public/routes.js';
import {demoSnapshot} from '../public/demo.js';
import {renderNetworkMap,routeDetails} from '../public/map.js';
const now=Date.now();
const flow={pid:45,protocol:'UDP',localAddress:'192.168.1.2',localPort:50123,remoteAddress:'142.250.1.1',remotePort:443,receivedBytes:6000000,sentBytes:4000};
const raw={timestamp:new Date(now).toISOString(),processes:{45:'firefox'},connections:[],adapters:[],dns:[{name:'rr1.googlevideo.com',address:flow.remoteAddress}]};

test('captures UDP remote peers, owner, service clues, and independent byte rates',()=>{
  const store=new TrafficStore();
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[flow]},now);
  const result=store.decorate(enrichSnapshot(raw,null),now);
  assert.equal(result.connections[0].app,'firefox');
  assert.equal(result.connections[0].receiveRate,3000000);
  assert.equal(result.connections[0].sendRate,2000);
  assert.equal(result.connections[0].remotePort,443);
  assert.equal(result.connections[0].scope,'Internet');
  assert.equal(serviceIdentity(result.connections[0]).label,'YouTube · video CDN');
  assert.equal(result.connections[0].receivedBytes,6000000);
  assert.equal(result.traffic.available,true);
});
test('idle intervals stop vehicles, stale capture clears speeds, departed peers expire',()=>{
  const store=new TrafficStore();
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[flow]},now);
  store.ingest({type:'traffic',timestamp:new Date(now+2000).toISOString(),elapsed:2,flows:[]},now+2000);
  assert.equal(store.decorate(enrichSnapshot(raw,null),now+2000).connections[0].receiveRate,0);
  assert.equal(store.decorate(enrichSnapshot(raw,null),now+10000).connections[0].receiveRate,null);
  store.ingest({type:'traffic',timestamp:new Date(now+32000).toISOString(),elapsed:2,flows:[]},now+32000);
  assert.equal(store.flows.size,0);
});
test('joins a captured TCP socket without duplicate connections or double counted rates',()=>{
  const store=new TrafficStore(), tcp={...flow,protocol:'TCP'};
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[tcp]},now);
  const snapshot=enrichSnapshot({...raw,connections:[{...tcp,app:'firefox',state:'Established'}]},null);
  const result=store.decorate(snapshot,now);
  assert.equal(result.connections.length,1);
  assert.equal(result.connections[0].receiveRate,3000000);
  assert.equal(result.connections[0].state,'Established');
});
test('shared IP hostname candidates never become a confident YouTube label',()=>{
  const identity=serviceIdentity({remoteAddress:'1.2.3.4',domainCandidates:['rr1.googlevideo.com','unrelated.example']});
  assert.equal(identity.confidence,'Ambiguous DNS');
  assert.equal(identity.label,'1.2.3.4');
  assert.equal(serviceIdentity({remoteAddress:'1.2.3.4',domainCandidates:['notgooglevideo.com']}).label,'notgooglevideo.com');
});
test('granular routes preserve all applications and can split services into IP/port/protocol',()=>{
  const sample=demoSnapshot();
  assert.ok(buildRoutes(sample.connections).length>3);
  const firefox=buildRoutes(sample.connections,{app:'firefox',query:'youtube'});
  assert.equal(firefox.length,2);
  assert.ok(firefox[0].receiveRate>1000000);
  const c=sample.connections[0];
  assert.equal(buildRoutes([c,{...c,remotePort:80}]).length,1);
  assert.equal(buildRoutes([c,{...c,remotePort:80}],{detail:'endpoint'}).length,2);
});
test('bandwidth controls bounded bicycle, truck and jet density; zero has no vehicles',()=>{
  for(const type of ['bicycle','truck','plane']) {
    assert.equal(fleet(0,type).count,0);
    assert.equal(fleet(null,type).count,0);
    assert.ok(fleet(3000000,type).count>fleet(3000,type).count);
    assert.ok(fleet(Number.MAX_SAFE_INTEGER,type).count<=44);
  }
});

test('hourly usage survives departed flows and expires individual intervals at the hour boundary',()=>{
  const store=new TrafficStore(), snapshot=enrichSnapshot(raw,null);
  const ingest=(at,flows)=>store.ingest({type:'traffic',timestamp:new Date(at).toISOString(),elapsed:2,flows},at,snapshot);
  ingest(now,[flow]);
  ingest(now+2000,[{...flow,localPort:50124,receivedBytes:1200,sentBytes:500}]);
  ingest(now+32001,[]);
  const result=store.decorate(snapshot,now+32001);
  assert.equal(result.connections.length,0);
  const [route]=buildRoutes(result.connections,{usageConnections:result.traffic.usageConnections});
  assert.equal(route.totalBytes60m,6005700);
  assert.equal(route.receivedBytes60m,6001200);
  assert.equal(route.sentBytes60m,4500);
  assert.equal(route.receiveRate,0);
  assert.equal(route.connections.length,0);
  assert.equal(route.service.label,'YouTube · video CDN');
  assert.equal(store.usage.size,1);
  assert.equal(store.decorate(snapshot,now+USAGE_WINDOW_MS).traffic.usageConnections[0].receivedBytes60m,1200);
  assert.equal(store.decorate(snapshot,now+USAGE_WINDOW_MS+2000).traffic.usageConnections.length,0);
});

test('minute graphs conserve measured bytes, age with the rolling hour and respect route filters',()=>{
  const store=new TrafficStore(),snapshot=enrichSnapshot(raw,null);
  const ingest=(at,flows)=>store.ingest({type:'traffic',timestamp:new Date(at).toISOString(),elapsed:2,flows},at,snapshot);
  ingest(now,[{...flow,receivedBytes:100,sentBytes:10},{...flow,localPort:50124,receivedBytes:50,sentBytes:5}]);
  ingest(now+60000,[{...flow,receivedBytes:200,sentBytes:20},{...flow,remoteAddress:'8.8.8.8',receivedBytes:400,sentBytes:40}]);
  const decorated=store.decorate(snapshot,now+60000);
  const options={usageConnections:decorated.traffic.usageConnections};
  const routes=buildRoutes(decorated.connections,options);
  const youtube=routes.find(r=>r.endpoint.remoteAddress===flow.remoteAddress);
  assert.equal(youtube.usageHistory.length,60);
  assert.deepEqual(youtube.usageHistory[58],{received:150,sent:15});
  assert.deepEqual(youtube.usageHistory[59],{received:200,sent:20});
  for(const route of routes) {
    assert.equal(route.usageHistory.reduce((sum,p)=>sum+p.received,0),route.receivedBytes60m);
    assert.equal(route.usageHistory.reduce((sum,p)=>sum+p.sent,0),route.sentBytes60m);
  }
  const filtered=buildRoutes(decorated.connections,{...options,query:flow.remoteAddress});
  assert.equal(filtered.length,1);
  assert.deepEqual(filtered[0].usageHistory,youtube.usageHistory);
  const expired=store.decorate(snapshot,now+USAGE_WINDOW_MS).traffic.usageConnections;
  assert.equal(expired.find(c=>c.remoteAddress===flow.remoteAddress).usageHistory.reduce((sum,p)=>sum+p.received,0),200);
});

test('route ranking uses hourly bytes despite reversed live speeds and counts TCP usage once',()=>{
  const store=new TrafficStore();
  const tcp={...flow,protocol:'TCP',app:'firefox',state:'Established'};
  const other={...tcp,app:'Code',pid:80,remoteAddress:'140.82.112.4',receivedBytes:100,sentBytes:100};
  const snapshot=enrichSnapshot({...raw,processes:{45:'firefox',80:'Code'},connections:[tcp,other]},null);
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[tcp,other]},now,snapshot);
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[{...other,receivedBytes:100000,sentBytes:100000}]},now+2000,snapshot);
  const result=store.decorate(snapshot,now+2000);
  const routes=buildRoutes(result.connections,{usageConnections:result.traffic.usageConnections});
  assert.deepEqual(routes.map(r=>r.app),['firefox','Code']);
  assert.equal(routes[0].totalBytes60m,6004000);
  assert.equal(routes[0].receiveRate,0);
  assert.equal(routes[1].receiveRate,50000);
  assert.equal(routes[0].connections.length,1);
  assert.equal(buildRoutes(result.connections,{usageConnections:result.traffic.usageConnections,direction:'asc'})[0].app,'Code');
});

test('sorts names, download, upload and connection count with deterministic ties and unknown usage last',()=>{
  const connections=[
    {...flow,app:'Zulu',scope:'Internet',domainCandidates:['a.example'],receivedBytes60m:10,sentBytes60m:90},
    {...flow,app:'Alpha',scope:'Internet',domainCandidates:['z.example'],receivedBytes60m:80,sentBytes60m:20},
    {...flow,app:'Unknown',scope:'Internet',domainCandidates:['u.example'],receiveRate:null,sendRate:null}
  ];
  assert.deepEqual(buildRoutes(connections).map(r=>r.app),['Alpha','Zulu','Unknown']);
  assert.deepEqual(buildRoutes(connections,{direction:'asc'}).map(r=>r.app),['Alpha','Zulu','Unknown']);
  assert.equal(buildRoutes(connections,{sort:'app',direction:'asc'})[0].app,'Alpha');
  assert.equal(buildRoutes(connections,{sort:'app',direction:'desc'})[0].app,'Zulu');
  assert.equal(buildRoutes(connections,{sort:'service',direction:'asc'})[0].app,'Zulu');
  assert.equal(buildRoutes(connections,{sort:'download'})[0].app,'Alpha');
  assert.equal(buildRoutes(connections,{sort:'upload'})[0].app,'Zulu');
  assert.equal(buildRoutes([...connections,connections[0]],{sort:'connections'})[0].app,'Zulu');
});

test('speed sorting is independent of hourly totals and leaves unavailable speeds last in either direction',()=>{
  const connections=[
    {...flow,app:'Fast download',scope:'Internet',receiveRate:900,sendRate:10,receivedBytes60m:100,sentBytes60m:900},
    {...flow,app:'Fast upload',scope:'Internet',receiveRate:100,sendRate:90,receivedBytes60m:900,sentBytes60m:100},
    {...flow,app:'Unknown speed',scope:'Internet',receiveRate:null,sendRate:null,receivedBytes60m:1000,sentBytes60m:1000}
  ];
  assert.deepEqual(buildRoutes(connections,{sort:'downloadSpeed'}).map(r=>r.app),['Fast download','Fast upload','Unknown speed']);
  assert.deepEqual(buildRoutes(connections,{sort:'downloadSpeed',direction:'asc'}).map(r=>r.app),['Fast upload','Fast download','Unknown speed']);
  assert.deepEqual(buildRoutes(connections,{sort:'uploadSpeed'}).map(r=>r.app),['Fast upload','Fast download','Unknown speed']);
  assert.deepEqual(buildRoutes(connections,{sort:'uploadSpeed',direction:'asc'}).map(r=>r.app),['Fast download','Fast upload','Unknown speed']);
  assert.equal(buildRoutes(connections,{sort:'download'})[0].app,'Unknown speed');
});

test('history respects filters, endpoint granularity and original application despite PID reuse',()=>{
  const store=new TrafficStore(), snapshot=enrichSnapshot(raw,null);
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[flow,{...flow,remotePort:80}]},now,snapshot);
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[]},now+32000,snapshot);
  const result=store.decorate({...snapshot,processes:{45:'reused-pid'}},now+32000);
  const options={usageConnections:result.traffic.usageConnections};
  assert.equal(buildRoutes([],{...options,app:'firefox',query:'youtube'}).length,1);
  assert.equal(buildRoutes([],{...options,app:'reused-pid'}).length,0);
  assert.equal(buildRoutes([],{...options,query:'absent'}).length,0);
  assert.equal(buildRoutes([],{...options,detail:'endpoint'}).length,2);
});

test('capture failures preserve measured history while clearing live rates; restart starts empty',()=>{
  const store=new TrafficStore(), snapshot=enrichSnapshot(raw,null);
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[flow]},now,snapshot);
  store.ingest({type:'status',available:false,message:'Capture stopped'},now+2000);
  const result=store.decorate(snapshot,now+2000);
  const [route]=buildRoutes(result.connections,{usageConnections:result.traffic.usageConnections});
  assert.equal(route.totalBytes60m,6004000);
  assert.equal(route.measured,false);
  assert.equal(result.traffic.available,false);
  assert.equal(new TrafficStore().decorate(snapshot,now).traffic.usageConnections.length,0);
});

test('renders sortable columns and completed endpoint routes with their usage details',()=>{
  const store=new TrafficStore(), snapshot=enrichSnapshot(raw,null);
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[flow]},now,snapshot);
  store.ingest({type:'traffic',timestamp:raw.timestamp,elapsed:2,flows:[]},now+32000,snapshot);
  const result=store.decorate(snapshot,now+32000);
  const state={snapshot:result,mode:'live',mapApp:'all',mapQuery:'',mapDetail:'endpoint',mapLimit:10,mapSort:'total',mapSortDirection:'desc',mapVehicle:'auto',motion:false};
  state.mapExpanded=new Set(['firefox']);
  const format={state,icon:()=>'',rate:n=>String(n),bytes:n=>String(n),esc:s=>String(s)};
  const html=renderNetworkMap(format);
  assert.match(html,/aria-sort="descending"/);
  for (const column of ['app','downloadSpeed','uploadSpeed','total','download','upload']) assert.ok(html.includes(`data-map-sort="${column}"`));
  assert.match(html,/6004000/);
  assert.match(html,/142.250.1.1:443/);
  assert.match(html,/No active connections/);
  const [route]=buildRoutes([],{usageConnections:result.traffic.usageConnections,detail:'endpoint'});
  assert.match(routeDetails(route,format,result),/Usage from completed transfers/);
});

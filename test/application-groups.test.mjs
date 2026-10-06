import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRoutes, groupApplicationRoutes, RouteTrafficView} from '../public/routes.js';
import {renderNetworkMap} from '../public/map.js';

const connection = {app:'firefox',pid:10,scope:'Internet',protocol:'TCP',state:'Established',remoteAddress:'1.2.3.4',remotePort:443,receiveRate:30,sendRate:5,receivedBytes60m:100,sentBytes60m:20};
const connections = [connection,
  {...connection,pid:11,protocol:'UDP',remoteAddress:'2.3.4.5',receiveRate:70,sendRate:15,receivedBytes60m:200,sentBytes60m:30},
  {...connection,app:'Codex',remoteAddress:'3.4.5.6',receivedBytes60m:300,sentBytes60m:10}];
const departed = {...connection,app:'FIREFOX.exe',pid:12,remoteAddress:'4.5.6.7',protocol:'UDP',receiveRate:0,sendRate:0,receivedBytes60m:40,sentBytes60m:10};
const options = {usageConnections:[departed]};
const state = {snapshot:{connections,traffic:{available:true,usageConnections:[departed]}},mode:'live',mapApp:'all',mapQuery:'',mapDetail:'service',mapLimit:10,mapSort:'total',mapSortDirection:'desc',mapVehicle:'auto',motion:false,mapExpanded:new Set(),mapCitiesInitialized:true};
const render = overrides => renderNetworkMap({state:{...state,...overrides},icon:()=>'',rate:String,bytes:String,esc:String});

test('one parent combines all process IDs, destinations, protocols and completed usage exactly once',()=>{
  const groups=groupApplicationRoutes(buildRoutes(connections,options));
  assert.equal(groups.length,2);
  const firefox=groups[0];
  assert.equal(firefox.key,'firefox');
  assert.equal(firefox.routes.length,3);
  assert.equal(firefox.connections.length,2);
  assert.deepEqual([...firefox.pids],[11,10,12]);
  assert.deepEqual([...firefox.protocols].sort(),['TCP','UDP']);
  assert.equal(firefox.addresses.size,3);
  assert.equal(firefox.receiveRate,100);
  assert.equal(firefox.sendRate,20);
  assert.equal(firefox.receivedBytes60m,340);
  assert.equal(firefox.sentBytes60m,60);
  assert.equal(firefox.totalBytes60m,400);
  assert.equal(groups.reduce((sum,g)=>sum+g.totalBytes60m,0),710);
  assert.equal(groupApplicationRoutes(buildRoutes(connections,options),{direction:'asc'})[0].app,'Codex');
});

test('search, endpoint mode and missing capture preserve matching parent totals',()=>{
  const filtered=groupApplicationRoutes(buildRoutes(connections,{...options,query:'2.3.4.5'}));
  assert.equal(filtered.length,1);
  assert.equal(filtered[0].routes.length,1);
  assert.equal(filtered[0].totalBytes60m,230);
  const endpoints=groupApplicationRoutes(buildRoutes([...connections,{...connection,remotePort:80}],{...options,detail:'endpoint'}));
  assert.equal(endpoints[0].routes.length,4);
  assert.equal(endpoints[0].totalBytes60m,520);
  const unknown=groupApplicationRoutes(buildRoutes([{...connection,receiveRate:null,sendRate:null,receivedBytes60m:null,sentBytes60m:null}]))[0];
  assert.equal(unknown.measured,false);
  assert.equal(unknown.totalBytes60m,null);
});

test('manual collapse and expansion remain keyed across sorting',()=>{
  const collapsed=render();
  assert.equal((collapsed.match(/class="transport-route application-parent"/g)||[]).length,2);
  assert.doesNotMatch(collapsed,/class="transport-route application-child"|data-route="firefox\|/);
  assert.match(collapsed,/data-map-expand="firefox" aria-expanded="false"/);
  const expanded=render({mapExpanded:new Set(['firefox']),mapSort:'app',mapSortDirection:'asc',mapLimit:1});
  // The first alphabetic parent is Codex; child counts do not consume pagination.
  assert.doesNotMatch(expanded,/class="transport-route application-child"/);
  const firefox=render({mapExpanded:new Set(['firefox'])});
  assert.equal((firefox.match(/class="transport-route application-child service-city-card"/g)||[]).length,3);
  assert.equal((firefox.match(/<strong>Firefox<\/strong>/g)||[]).length,1);
  assert.match(firefox,/data-map-expand="firefox" aria-expanded="true"/);
  assert.match(firefox,/No active connections/);
  const endpoints=render({mapDetail:'endpoint',mapExpanded:new Set(['firefox'])});
  assert.match(endpoints,/1.2.3.4:443/);
  assert.match(endpoints,/Show endpoints|Hide endpoints/);
});

test('new city applications open once while manually collapsed applications remain closed',()=>{
  const initial={...state,mapCitiesInitialized:false,mapExpanded:new Set()};
  const first=renderNetworkMap({state:initial,icon:()=>'',rate:String,bytes:String,esc:String});
  assert.equal((first.match(/service-city-card/g)||[]).length,4);
  initial.mapExpanded.delete('firefox');
  const second=renderNetworkMap({state:initial,icon:()=>'',rate:String,bytes:String,esc:String});
  assert.match(second,/data-map-expand="firefox" aria-expanded="false"/);
  assert.equal((second.match(/service-city-card/g)||[]).length,1);
});

test('parent smooth speeds equal child speeds and filtered display does not inherit unrelated traffic',()=>{
  const view=new RouteTrafficView();
  const snapshot={...state.snapshot,timestamp:new Date(100000).toISOString(),traffic:{...state.snapshot.traffic,timestamp:new Date(100000).toISOString()}};
  view.update(snapshot,'live');
  const quiet={...snapshot,connections:connections.map(c=>({...c,receiveRate:0,sendRate:0})),traffic:{...snapshot.traffic,timestamp:new Date(102000).toISOString()}};
  view.update(quiet,'live');
  const parent=groupApplicationRoutes(buildRoutes(quiet.connections,options))[0];
  assert.ok(Math.abs(view.lane(parent,'application','receiveRate').rate-100*Math.exp(-.2))<1e-8);
  const filtered=render({snapshot:quiet,trafficView:view,mapQuery:'2.3.4.5'});
  assert.match(filtered,new RegExp(`data-download-rate="${70*Math.exp(-.2)}`));
  assert.match(filtered,/<small class="usage-label">Total · 60 min<\/small>230/);
});

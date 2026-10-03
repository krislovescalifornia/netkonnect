import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RouteTrafficView, buildRoutes, transportForRate, LOW_TRAFFIC_LIMIT, HIGH_TRAFFIC_LIMIT} from '../public/routes.js';
import {renderNetworkMap, routeDetails} from '../public/map.js';

const connection = {app:'firefox',pid:45,scope:'Internet',protocol:'UDP',state:'Observed',remoteAddress:'1.2.3.4',remotePort:443};
const sample = (at, receiveRate, sendRate = 2000) => ({
  timestamp:new Date(at).toISOString(), traffic:{available:true,timestamp:new Date(at).toISOString()},
  connections:[{...connection,receiveRate,sendRate,receivedBytes60m:987654321,sentBytes60m:1234}]
});
const lane = (view, snapshot, direction='receiveRate', detail='service') => view.lane(buildRoutes(snapshot.connections,{detail})[0],detail,direction);

test('smooths alternating bursts by elapsed sample time and leaves raw measurements and usage intact',()=>{
  const view = new RouteTrafficView();
  view.update(sample(100000,2000000),'live');
  const idle = sample(102000,0);
  view.update(idle,'live');
  const smoothed = lane(view,idle).rate;
  assert.ok(Math.abs(smoothed-2000000*Math.exp(-.2))<1e-6);
  assert.equal(lane(view,idle,'sendRate').rate,2000);
  assert.equal(lane(view,idle,'receiveRate','endpoint').rate,smoothed);
  assert.equal(idle.connections[0].receiveRate,0);
  assert.equal(buildRoutes(idle.connections)[0].totalBytes60m,987655555);
  // Polls/redraws with the same timestamp cannot repeatedly decay the average.
  view.update(idle,'live');
  assert.equal(lane(view,idle).rate,smoothed);
  const burst = sample(104000,2000000);
  view.update(burst,'live');
  assert.ok(lane(view,burst).rate>smoothed && lane(view,burst).rate<2000000);
  const afterBurst = lane(view,burst).rate;
  const delayed = sample(114000,0);
  view.update(delayed,'live');
  assert.ok(Math.abs(lane(view,delayed).rate-afterBurst*Math.exp(-1))<1e-6);
  assert.ok(lane(view,delayed).rate<800000);
});

test('idle gaps fade while sustained idle stops vehicles after 20 seconds',()=>{
  const view = new RouteTrafficView();
  view.update(sample(100000,2000000),'live');
  view.update(sample(102000,0),'live');
  const almost = sample(121999,0);
  view.update(almost,'live');
  assert.ok(lane(view,almost).rate>0);
  const idle = sample(122000,0);
  view.update(idle,'live');
  assert.equal(lane(view,idle).rate,0);
  const resumed = sample(124000,100000);
  view.update(resumed,'live');
  assert.ok(lane(view,resumed).rate>0);
});

test('capture loss, long gaps, clock resets, restart and sample mode discard old averages',()=>{
  const view = new RouteTrafficView();
  view.update(sample(100000,2000000),'live-1');
  view.update({traffic:{available:false}},'live-1');
  assert.equal(view.lanes.size,0);
  const zero = sample(102000,0);
  view.update(zero,'live-1');
  assert.equal(lane(view,zero).rate,0);
  view.update(sample(104000,2000000),'live-1');
  const small = sample(106000,500);
  view.update(small,'live-2');
  assert.equal(lane(view,small).rate,500);
  view.update(sample(108000,2000000),'live-2');
  view.update(sample(110000,500),'demo');
  assert.equal(lane(view,small).rate,500);
  view.update(sample(112000,2000000),'demo');
  view.update(sample(143001,500),'demo');
  assert.equal(lane(view,small).rate,500);
  view.update(sample(100000,2000),'demo');
  assert.equal(lane(view,small).rate,2000);
  view.update({...sample(102000,0),connections:[]},'demo');
  assert.equal(view.lanes.size,0);
});

test('automatic transport follows per-direction throughput with boundary hysteresis',()=>{
  assert.equal(transportForRate(3000),'bicycle');
  assert.equal(transportForRate(300000),'truck');
  assert.equal(transportForRate(3000000),'plane');
  assert.equal(transportForRate(LOW_TRAFFIC_LIMIT*1.1,'bicycle'),'bicycle');
  assert.equal(transportForRate(LOW_TRAFFIC_LIMIT*.9,'truck'),'truck');
  assert.equal(transportForRate(LOW_TRAFFIC_LIMIT*1.3,'bicycle'),'truck');
  assert.equal(transportForRate(LOW_TRAFFIC_LIMIT*.7,'truck'),'bicycle');
  assert.equal(transportForRate(HIGH_TRAFFIC_LIMIT*1.1,'truck'),'truck');
  assert.equal(transportForRate(HIGH_TRAFFIC_LIMIT*.9,'plane'),'plane');
  assert.equal(transportForRate(HIGH_TRAFFIC_LIMIT*1.3,'truck'),'plane');
  assert.equal(transportForRate(HIGH_TRAFFIC_LIMIT*.7,'plane'),'truck');
});

test('Service lanes render smoothed labels and independent fleets while details retain exact rates',()=>{
  const view = new RouteTrafficView();
  view.update(sample(100000,3000000),'live');
  const snapshot = sample(102000,0);
  view.update(snapshot,'live');
  const state = {snapshot,trafficView:view,mode:'live',mapApp:'all',mapQuery:'',mapDetail:'service',mapLimit:10,mapSort:'total',mapSortDirection:'desc',mapVehicle:'auto',motion:true};
  const html = renderNetworkMap({state,icon:()=>'',rate:n=>String(n),bytes:n=>String(n),esc:s=>String(s)});
  assert.match(html,new RegExp(String(lane(view,snapshot).rate)));
  assert.match(html,/data-download-type="plane"/);
  assert.match(html,/data-upload-type="bicycle"/);
  assert.doesNotMatch(html,/train|Idle this interval|road-idle/);
  assert.match(html,/987655555/);
  // The map only renders lane settings. Persistent vehicles belong to the
  // separate animator and must never be rebuilt by a sample refresh.
  assert.doesNotMatch(html,/transport-vehicle|animateTransform/);
  const details = routeDetails(buildRoutes(snapshot.connections)[0],{esc:String,rate:String,bytes:String,icon:()=>''},snapshot);
  assert.match(details,/Download<strong>0<\/strong>/);
  assert.match(details,/Upload<strong>2000<\/strong>/);
});

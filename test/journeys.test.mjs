import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JourneyQueue} from '../public/routes.js';
import {vehicle,journeyPose,roadSpeed,TransportAnimator} from '../public/map.js';
import {VEHICLE_STAGES,cityVehicleScale} from '../public/vehicles.js';
import {WORLD_ROUTE_BASELINES} from '../public/world.js';

const settings = (type='truck',rate=400000,key='route|download',incoming=true) => ({key,type,rate,incoming});
const travel = (queue,milliseconds) => { for(let elapsed=0;elapsed<milliseconds;elapsed+=100) queue.advance(Math.min(100,milliseconds-elapsed)); };

test('a truck completes its journey across six two-second sample refreshes',()=>{
  const queue = new JourneyQueue(), config = settings();
  queue.configure([config]); queue.advance(0);
  const first = queue.lanes.get(config.key).vehicles[0];
  let previous = 0;
  for(let sample=1;sample<6;sample++) {
    travel(queue,2000); queue.configure([{...config,rate:sample%2?200000:500000}]);
    assert.equal(queue.lanes.get(config.key).vehicles.find(v=>v.id===first.id),first);
    assert.equal(first.type,'truck');
    assert.ok(queue.progress(first)>previous);
    previous = queue.progress(first);
  }
  assert.ok(queue.progress(first)>0.8);
  travel(queue,1999);
  assert.ok(queue.lanes.get(config.key).vehicles.some(v=>v.id===first.id));
  queue.advance(1);
  assert.ok(!queue.lanes.get(config.key).vehicles.some(v=>v.id===first.id));
  assert.equal(queue.progress(first),1);
});

test('traffic changes queue a jet, then a truck, then another jet without changing existing departures',()=>{
  const queue = new JourneyQueue(), key = 'route|download';
  queue.configure([settings('plane',3000000)]); queue.advance(0);
  const jet = queue.lanes.get(key).vehicles[0];
  travel(queue,800);
  queue.configure([settings('truck',400000)]); travel(queue,400);
  const truck = queue.lanes.get(key).vehicles.at(-1);
  assert.equal(truck.type,'truck');
  const oldArrival = jet.arrives;
  queue.configure([settings('plane',3000000)]); travel(queue,2400);
  const nextJet = queue.lanes.get(key).vehicles.at(-1);
  assert.equal(nextJet.type,'plane');
  assert.notEqual(nextJet.id,jet.id);
  assert.equal(jet.arrives,oldArrival);
  assert.deepEqual(queue.lanes.get(key).vehicles.map(v=>v.type),['plane','truck','plane']);
  assert.ok(queue.progress(jet)>queue.progress(truck));
  assert.ok(queue.progress(truck)>queue.progress(nextJet));
});

test('idle and unavailable rates stop departures while every in-flight vehicle finishes',()=>{
  for(const rate of [0,null]) {
    const queue = new JourneyQueue(), key = 'route|download';
    queue.configure([settings()]); queue.advance(0);
    const truck = queue.lanes.get(key).vehicles[0];
    travel(queue,2000);
    queue.configure([settings('bicycle',rate)]);
    const ids = queue.lanes.get(key).vehicles.map(v=>v.id);
    travel(queue,4000);
    assert.deepEqual(queue.lanes.get(key).vehicles.map(v=>v.id),ids);
    assert.ok(queue.progress(truck)>=.5);
    travel(queue,12000);
    assert.equal(queue.lanes.get(key).vehicles.length,0);
  }
});

test('narrow lanes limit departure density without altering in-flight vehicles or their arrival times',()=>{
  const queue=new JourneyQueue(),config={...settings('truck',3000000),capacity:2};
  queue.configure([config]);queue.advance(0);
  const first=queue.lanes.get(config.key).vehicles[0];
  assert.equal(queue.lanes.get(config.key).count,2);
  travel(queue,2000);queue.configure([{...config,capacity:1}]);
  assert.equal(queue.lanes.get(config.key).count,1);
  assert.equal(queue.lanes.get(config.key).vehicles[0],first);
  assert.equal(first.arrives,12000);
});

test('repeated redraws keep the departure schedule; each direction uses its own queue',()=>{
  const queue = new JourneyQueue();
  const configurations=[settings('bicycle',2000),settings('plane',3000000,'route|upload',false)];
  queue.configure(configurations); queue.advance(0);
  for(let i=0;i<50;i++) { queue.configure(configurations); queue.advance(0); }
  assert.equal(queue.lanes.get('route|download').vehicles.length,1);
  assert.equal(queue.lanes.get('route|upload').vehicles.length,1);
  travel(queue,3000);
  assert.equal(queue.lanes.get('route|download').vehicles.length,1);
  assert.equal(queue.lanes.get('route|download').vehicles[0].incoming,true);
  assert.ok(queue.lanes.get('route|upload').vehicles.length>1);
  assert.equal(queue.lanes.get('route|upload').vehicles[0].incoming,false);
});

test('alternating densities cannot keep postponing the next departure',()=>{
  const queue = new JourneyQueue(), key = 'route|download';
  queue.configure([settings('truck',400000)]); queue.advance(0);
  travel(queue,500);
  queue.configure([settings('bicycle',1)]);
  travel(queue,1000);
  assert.equal(queue.lanes.get(key).vehicles.length,2);
  assert.equal(queue.lanes.get(key).vehicles.at(-1).type,'bicycle');
});

test('pauses preserve progress and a delayed frame does not create a catch-up fleet',()=>{
  const queue = new JourneyQueue();
  queue.configure([settings()]); queue.advance(0);
  const truck = queue.lanes.get('route|download').vehicles[0];
  travel(queue,2000);
  const progress = queue.progress(truck);
  queue.advance(0,false);
  queue.configure([settings('plane',3000000)]);
  queue.advance(0,false);
  assert.equal(queue.progress(truck),progress);
  queue.advance(100);
  assert.ok(queue.progress(truck)>progress);
  queue.advance(600000);
  assert.equal(queue.lanes.get('route|download').vehicles.length,1);
});

test('hidden routes drain without new departures, then release their queue',()=>{
  const queue = new JourneyQueue();
  queue.configure([settings()]); queue.advance(0);
  queue.configure([]);
  travel(queue,2000);
  assert.equal(queue.lanes.get('route|download').vehicles.length,1);
  travel(queue,10000);
  assert.equal(queue.lanes.size,0);
});

test('supply sprites carry wood, crates and walking helpers in both directions',()=>{
  for(const incoming of [true,false]) {
    assert.match(vehicle('bicycle',incoming),/supply-pushcart/);
    assert.match(vehicle('bicycle',incoming),/cart-handler/);
    assert.match(vehicle('bicycle',incoming),/artwork\/fleet\/activity\/crew-\d\.png/);
    assert.doesNotMatch(vehicle('bicycle',incoming),/class="bicycle"|bicycle-spokes/);
    assert.match(vehicle('truck',incoming),/supply-pickup/);
    assert.match(vehicle('plane',incoming),/supply-plane/);
  }
});

test('downloads stop to unload then depart right and fade; uploads return left',()=>{
  for(const type of VEHICLE_STAGES.map(s=>s.id)) {
    const incoming={incoming:true,type},outgoing={incoming:false,type};
    assert.ok(journeyPose(incoming,.5,true).x>journeyPose(incoming,0,true).x);
    const arrival=journeyPose(incoming,.62,true),delivery=journeyPose(incoming,.75,true),departure=journeyPose(incoming,.9,true);
    const mode=VEHICLE_STAGES.find(s=>s.id===type).mode,end=655+(mode==='water'?155:0);
    assert.equal(arrival.x,end);assert.equal(delivery.x,arrival.x);
    assert.equal(arrival.unloaded,0);assert.equal(delivery.unloaded,1);
    assert.equal(delivery.opacity,1);assert.ok(departure.x>delivery.x);
    assert.equal(departure.unloaded,1);assert.ok(departure.opacity<1);
    assert.equal(departure.deliveryX,delivery.x);
    assert.ok(journeyPose(incoming,1,true).x>900);assert.equal(journeyPose(incoming,1,true).opacity,0);
    const halfWidth=VEHICLE_STAGES.find(s=>s.id===type).width*cityVehicleScale(VEHICLE_STAGES.find(s=>s.id===type))/2;
    assert.ok(journeyPose(outgoing,0,true).x-halfWidth>900);
    assert.ok(journeyPose(outgoing,1,true).x+halfWidth<0);
    assert.equal(journeyPose(outgoing,.93,true).unloaded,0);
    const baseline=WORLD_ROUTE_BASELINES[mode];
    const offset=mode==='air'?0:mode==='water'?6:11*cityVehicleScale(VEHICLE_STAGES.find(s=>s.id===type));
    assert.equal(journeyPose(incoming,0,true).y,baseline.download-offset);
    assert.equal(journeyPose(outgoing,0,true).y,baseline.upload-offset);
    for(const t of [0,.25,.5,.75,1]) {
      assert.equal(journeyPose(incoming,t,true).angle,0);
      assert.equal(journeyPose(outgoing,t,true).angle,0);
    }
  }
});

test('uploads enter and leave wholly outside every responsive scene without changing their departure route',()=>{
  for(const sceneEnd of [115,655,1450])for(const spec of VEHICLE_STAGES) {
    const journey={type:spec.id,incoming:false},halfWidth=spec.width*cityVehicleScale(spec)/2;
    assert.ok(journeyPose(journey,0,true,sceneEnd).x-halfWidth>sceneEnd+245);
    assert.ok(journeyPose(journey,.999,true,sceneEnd).x+halfWidth<0);
    let previous=Infinity;
    for(let i=0;i<=100;i++) {
      const pose=journeyPose(journey,i/100,true,sceneEnd);
      assert.ok(pose.x<previous);previous=pose.x;assert.equal(pose.opacity,1);
    }
  }
});


test('road overlays keep one decimal place, including sub-megabit rates',()=>{
  for(const [rate,value] of [[0,'0.0'],[100000,'0.8'],[125000,'1.0'],[1250000,'10.0'],[12500000,'100.0'],[null,'—']])
    assert.equal(roadSpeed(rate),`<span class="speed-value">${value} <small>Mbit/s</small></span>`);
});

test('delivery braking, bay entry, unloading and acceleration have continuous positions and velocities',()=>{
  const journey={incoming:true,type:'semi'},epsilon=.000001;
  for(const boundary of [.50,.62*.8,.62,.65,.74,.78,.78+.22*.2,.78+.22*.32]) {
    const a=journeyPose(journey,boundary-epsilon,true),b=journeyPose(journey,boundary,true),c=journeyPose(journey,boundary+epsilon,true);
    assert.ok(Math.hypot(a.x-c.x,a.y-c.y)<.01);
    assert.ok(Math.abs((b.x-a.x)-(c.x-b.x))/epsilon<.2,'horizontal speed remains continuous');
    assert.ok(Math.abs((b.y-a.y)-(c.y-b.y))/epsilon<.2,'bay steering remains continuous');
  }
});

test('a stalled paint resumes without jumping forward through the journey',()=>{
  let time=0;const animator=new TransportAnimator({clock:()=>time});
  animator.active=true;animator.queue.configure([settings()]);animator.queue.advance(0);
  time=16;animator.tick();assert.equal(animator.queue.now,16);
  time=1016;animator.tick();assert.equal(animator.queue.now,66);
  animator.active=false;time=3016;animator.tick();assert.equal(animator.queue.now,66);
});

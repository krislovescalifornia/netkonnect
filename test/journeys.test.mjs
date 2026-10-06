import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JourneyQueue} from '../public/routes.js';
import {vehicle} from '../public/map.js';

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
    assert.match(vehicle('bicycle',incoming),/helper-legs/);
    assert.doesNotMatch(vehicle('bicycle',incoming),/class="bicycle"|bicycle-spokes/);
    assert.match(vehicle('truck',incoming),/supply-pickup/);
    assert.match(vehicle('plane',incoming),/supply-plane/);
  }
});

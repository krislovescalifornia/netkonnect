import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSpeed, speedUnit, nextSpeedUnit, speedUnits, speedButton } from '../public/speed.js';

test('rates default to decimal megabits and byte choices preserve the existing byte convention',()=>{
  assert.equal(formatSpeed(12500000),'100 Mbit/s');
  assert.equal(formatSpeed(125000),'1.00 Mbit/s');
  assert.equal(formatSpeed(1024,'KB/s'),'1.00 KB/s');
  assert.equal(formatSpeed(1024 ** 2,'MB/s'),'1.00 MB/s');
  assert.equal(formatSpeed(1024 ** 3,'GB/s'),'1.00 GB/s');
  assert.equal(formatSpeed(125,'Kbit/s'),'1.00 Kbit/s');
  assert.equal(formatSpeed(125000000,'Gbit/s'),'1.00 Gbit/s');
});

test('unavailable rates stay unavailable and zero stays idle',()=>{
  assert.equal(formatSpeed(null),'—');
  assert.equal(formatSpeed(undefined),'—');
  assert.equal(formatSpeed(NaN),'—');
  assert.equal(formatSpeed(0),'0 Mbit/s');
});

test('saved choices are validated and clicking cycles every supported unit',()=>{
  assert.equal(speedUnit(undefined),'Mbit/s');
  assert.equal(speedUnit('<script>'),'Mbit/s');
  assert.equal(speedUnit('KB/s'),'KB/s');
  let unit='Mbit/s'; const seen=new Set();
  for(let i=0;i<speedUnits.length;i++){seen.add(unit);unit=nextSpeedUnit(unit);}
  assert.equal(seen.size,speedUnits.length);
  assert.equal(unit,'Mbit/s');
  assert.match(speedButton(125000,'Mbit/s'),/data-action="speed-unit"/);
  assert.match(speedButton(125000,'Mbit/s'),/Change speed units to MB\/s/);
});

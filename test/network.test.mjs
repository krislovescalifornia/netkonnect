import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scope, enrichSnapshot } from '../lib/network.mjs';

test('classifies local, private, and public destinations', () => {
  for(const ip of ['127.0.0.1','127.2.3.4','::1','::ffff:127.0.0.1']) assert.equal(scope(ip),'Loopback');
  for(const ip of ['10.1.2.3','192.168.1.1','172.16.0.1','172.31.2.1','fe80::1','fd12::1','169.254.1.1','::ffff:192.168.1.1'])assert.equal(scope(ip),'Local');
  for(const ip of ['172.32.0.1','8.8.8.8','2606:4700::1111'])assert.equal(scope(ip),'Internet');
  for(const ip of ['0.0.0.0','::','*'])assert.equal(scope(ip),'Unbound');
});
const fixture = (timestamp, receivedBytes, sentBytes) => ({ timestamp, adapters:[{id:'adapter',status:'Up',receivedBytes,sentBytes}], connections:[{app:'Browser',pid:5,protocol:'TCP',localAddress:'192.168.1.5',localPort:1234,remoteAddress:'8.8.8.8',remotePort:443,state:'Established'}], dns:[{name:'one.example',address:'8.8.8.8'},{name:'two.example',address:'8.8.8.8'}] });
test('measures counter differences and preserves first-seen and ambiguous DNS clues', () => {
  const seen=new Map(), now=Date.now();
  const a=enrichSnapshot(fixture(new Date(now).toISOString(),1000,500),null,[],seen);
  assert.equal(a.adapters[0].receiveRate,null);
  assert.equal(a.totals.ready,false);
  const b=enrichSnapshot(fixture(new Date(now+8000).toISOString(),9000,4500),a,a.history,seen);
  assert.equal(b.adapters[0].receiveRate,1000);
  assert.equal(b.adapters[0].sendRate,500);
  assert.equal(b.connections[0].firstSeen,a.connections[0].firstSeen);
  assert.deepEqual(b.connections[0].domainCandidates,['one.example','two.example']);
  assert.equal(b.history.length,2);
});
test('counter resets produce zero rate and new adapters await a baseline', () => {
  const now=Date.now();const a=enrichSnapshot(fixture(new Date(now).toISOString(),9000,4500),null);
  const raw=fixture(new Date(now+8000).toISOString(),200,100);
  raw.adapters.push({id:'new',status:'Up',receivedBytes:100000,sentBytes:100000});
  const b=enrichSnapshot(raw,a);
  assert.equal(b.adapters[0].receiveRate,0);
  assert.equal(b.adapters[1].receiveRate,null);
});

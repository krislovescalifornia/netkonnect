import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {SnapshotWorker} from '../lib/snapshot-worker.mjs';

const sample={timestamp:'2026-10-11T12:00:00Z',connections:[],adapters:[],computer:'Café'};
function fixture(options={}) {
  const children=[];
  const worker=new SnapshotWorker('unused',{...options,spawnWorker:()=>{
    const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),killed:false});
    child.kill=()=>{child.killed=true;};children.push(child);return child;
  }});
  return {worker,children,reply:(child,value=sample)=>child.stdout.write(JSON.stringify(value)+'\r\n')};
}
test('snapshot requests reuse one worker, coalesce concurrent calls and decode split UTF-8',async t=>{
  const {worker,children,reply}=fixture();t.after(()=>worker.stop());
  const first=worker.collect();assert.equal(worker.collect(),first);
  const payload=Buffer.from('\uFEFF'+JSON.stringify(sample)+'\r\n'),split=payload.indexOf(Buffer.from('é'))+1;
  children[0].stdout.write(payload.subarray(0,split));children[0].stdout.write(payload.subarray(split));
  assert.deepEqual(await first,sample);
  const next=worker.collect();reply(children[0],{...sample,timestamp:'later'});
  assert.equal((await next).timestamp,'later');assert.equal(children.length,1);
  assert.equal(children[0].stdin.read().toString(),'collect\ncollect\n');
});
test('crashed, invalid and oversized snapshot workers are replaced without stale replies',async t=>{
  const {worker,children,reply}=fixture({maxBuffer:256});t.after(()=>worker.stop());
  for(const failure of ['exit','json','shape','overflow','pipe']) {
    const pending=worker.collect(),child=children.at(-1),rejected=assert.rejects(pending);
    if(failure==='exit')child.emit('exit',1);
    if(failure==='json')child.stdout.write('bad\n');
    if(failure==='shape')reply(child,{timestamp:'wrong'});
    if(failure==='overflow')child.stdout.write('x'.repeat(257));
    if(failure==='pipe')child.stdout.emit('error',new Error('Pipe read failed'));
    await rejected;assert.equal(child.killed,true);
    const recovered=worker.collect(),replacement=children.at(-1);
    child.emit('exit',1);reply(child,{...sample,timestamp:'stale'});reply(replacement);
    assert.deepEqual(await recovered,sample);
  }
});
test('timeout and stop reject pending collection and stop prevents respawning',async()=>{
  const {worker,children}=fixture({timeout:10});
  await assert.rejects(worker.collect(),/timed out/);assert.equal(children[0].killed,true);
  const pending=worker.collect(),rejected=assert.rejects(pending,/stopped/);
  worker.stop();await rejected;assert.equal(children[1].killed,true);
  await assert.rejects(worker.collect(),/stopped/);assert.equal(children.length,2);
});

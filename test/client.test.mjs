import test from 'node:test';
import assert from 'node:assert/strict';
import {localRequest} from '../public/client.js';

function desktop(t,bridge){
  const previous={window:globalThis.window,location:globalThis.location};
  globalThis.window={netKonnect:bridge};globalThis.location={href:'netkonnect://app/'};
  t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
}

test('desktop polling decodes snapshot text after the isolated bridge without changing measured data',async t=>{
  const snapshot={snapshot:{traffic:{cityUsage:[{app:'Example',receivedBytesTotal:2**43+123,sentBytesTotal:0}],usageConnections:[{receivedBytes60m:0,receiveRate:null,usageHistory:[{received:71,sent:9}]}]}},service:{instanceId:'unchanged'},error:null};
  desktop(t,{snapshotText:async()=>JSON.stringify({result:snapshot}),snapshot:()=>{throw new Error('The object bridge must not be used for polling');}});
  const result=await localRequest('/api/snapshot');
  assert.equal(result.ok,true);assert.deepEqual(await result.json(),snapshot);
});

test('desktop text snapshot failures remain visible rather than returning fabricated traffic',async t=>{
  desktop(t,{snapshotText:async()=>{throw new Error('Companion unavailable');}});
  let result=await localRequest('/api/snapshot');
  assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:'Companion unavailable'});
  window.netKonnect.snapshotText=async()=>JSON.stringify({error:'Capture unavailable'});
  result=await localRequest('/api/snapshot');assert.equal(result.ok,false);assert.deepEqual(await result.json(),{error:'Capture unavailable'});
  window.netKonnect.snapshotText=async()=>'{invalid';
  result=await localRequest('/api/snapshot');assert.equal(result.ok,false);assert.ok((await result.json()).error);
});

test('legacy desktop snapshots and other operations retain their existing contracts',async t=>{
  desktop(t,{snapshot:async()=>({snapshot:null}),analytics:async options=>({options}),restart:async()=>({restarting:true})});
  assert.deepEqual(await (await localRequest('/api/snapshot')).json(),{snapshot:null});
  assert.deepEqual(await (await localRequest('/api/analytics?range=day')).json(),{options:{range:'day'}});
  assert.deepEqual(await (await localRequest('/api/restart',{method:'POST'})).json(),{restarting:true});
  assert.equal((await localRequest('/api/restart')).status,503);
});

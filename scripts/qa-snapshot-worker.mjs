// Windows integration: fresh observations, identity parity, crash recovery, EOF.
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {once} from 'node:events';
import {SnapshotWorker} from '../lib/snapshot-worker.mjs';
const root=resolve('.'),output=resolve('test-results/performance');
await mkdir(output,{recursive:true});
const baseline=resolve(output,'collector-baseline.ps1');
await writeFile(baseline,execFileSync('git',['show','HEAD:collector.ps1']));
const before=JSON.parse((await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',baseline],{windowsHide:true,maxBuffer:12*1024*1024,timeout:25000})).stdout.replace(/^\uFEFF/,''));
const worker=new SnapshotWorker(root),samples=[];
try {
  let pid,previous;
  for(let i=0;i<3;i++) {
    const began=performance.now(),snapshot=await worker.collect();
    pid??=worker.child.pid;assert.equal(worker.child.pid,pid);
    assert.ok(!previous||Date.parse(snapshot.timestamp)>Date.parse(previous));previous=snapshot.timestamp;
    const own=snapshot.processDetails[process.pid];assert.ok(own?.path);assert.ok(own?.startedAt);
    let identities=0;
    for(const [id,prior] of Object.entries(before.processDetails)) {
      const current=snapshot.processDetails[id];
      if(!current||Date.parse(current.startedAt)!==Date.parse(prior.startedAt))continue;
      if(prior.path)assert.equal(current.path?.toLowerCase(),prior.path.toLowerCase(),`Executable identity ${id}`);
      if(prior.product)assert.equal(current.product,prior.product);
      identities++;
    }
    let adapters=0;
    for(const prior of before.adapters) {
      const current=snapshot.adapters.find(a=>a.id===prior.id);assert.ok(current,prior.name);
      for(const key of ['ipv4','ipv6','dns','gateway'])for(const value of prior[key]||[])assert.ok(current[key].includes(value),`${prior.name} ${key}`);
      if(prior.receivedBytes!==null)assert.equal(typeof current.receivedBytes,'number');
      adapters++;
    }
    samples.push({elapsedMs:performance.now()-began,identities,adapters,connections:snapshot.connections.length});
  }
  const old=worker.child,exited=once(old,'exit');old.kill();await exited;
  assert.ok((await worker.collect()).timestamp);assert.notEqual(worker.child.pid,pid);
  const eofChild=worker.child,eofExit=once(eofChild,'exit');eofChild.stdin.end();await eofExit;
  await writeFile(resolve(output,'snapshot-worker.json'),JSON.stringify({samples,crashRecovery:true,parentEOF:true},null,2));
  console.log(JSON.stringify({samples,crashRecovery:true,parentEOF:true}));
} finally {worker.stop();}

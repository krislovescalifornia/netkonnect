import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {join} from 'node:path';

// Reuse the PowerShell runtime and loaded OS modules, never the observations.
// Each request reads fresh tables; a bad or stalled worker is replaced next time.
export class SnapshotWorker {
  constructor(root,{spawnWorker=spawn,timeout=25000,maxBuffer=12*1024*1024}={}) {
    Object.assign(this,{root,spawnWorker,timeout,maxBuffer});
    this.child=null;this.pending=null;this.stopped=false;
  }
  collect() {
    if(this.stopped)return Promise.reject(new Error('Snapshot collection stopped.'));
    if(this.pending)return this.pending.promise;
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    this.pending={promise,resolve,reject,timer:setTimeout(()=>this.fail(new Error('Snapshot collection timed out.')),this.timeout)};
    try {
      if(!this.child)this.start();
      this.child.stdin.write('collect\n');
    } catch(error) {this.fail(error);}
    return promise;
  }
  start() {
    const child=this.spawnWorker('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(this.root,'collector.ps1'),'-Persistent'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;
    const decoder=new StringDecoder('utf8');let input='',bytes=0;
    child.stderr.resume();
    const fail=error=>{if(this.child===child)this.fail(error);};
    child.on('error',fail);child.stdin.on('error',fail);
    child.stdout.on('error',fail);child.stderr.on('error',fail);
    child.on('exit',()=>fail(new Error('The snapshot worker exited before the next observation.')));
    child.stdout.on('data',chunk=>{
      if(this.child!==child)return;
      bytes+=chunk.length;
      if(bytes>this.maxBuffer)return fail(new Error('Snapshot exceeded its size limit.'));
      input+=decoder.write(chunk);
      const end=input.indexOf('\n');if(end<0)return;
      try {
        const snapshot=JSON.parse(input.slice(0,end).replace(/^\uFEFF/,''));
        if(!snapshot||!Array.isArray(snapshot.connections)||!Array.isArray(snapshot.adapters)||!snapshot.timestamp)throw new Error('Invalid snapshot from the worker.');
        if(input.slice(end+1).trim())throw new Error('Unexpected extra snapshot output.');
        input='';bytes=0;
        const pending=this.pending;this.pending=null;
        if(pending){clearTimeout(pending.timer);pending.resolve(snapshot);}
      } catch(error) {fail(error);}
    });
  }
  fail(error) {
    const child=this.child;this.child=null;
    const pending=this.pending;this.pending=null;
    if(pending){clearTimeout(pending.timer);pending.reject(error);}
    child?.kill();
  }
  stop() {this.stopped=true;this.fail(new Error('Snapshot collection stopped.'));}
}

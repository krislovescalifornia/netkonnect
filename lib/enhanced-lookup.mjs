import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {parseAddress,addressKey} from '../public/address.js';
import {scope} from './network.mjs';
import {hostname} from './evidence.mjs';
export class EnhancedLookup {
  constructor(root,{run=null}={}) {
    this.enabled=false;this.results=new Map();this.pending=new Map();this.controllers=new Map();this.generation=0;
    this.run=run||((address,signal)=>new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'desktop','enhanced-lookup.ps1'),'-Address',address],{signal,windowsHide:true,timeout:15000,maxBuffer:128*1024,encoding:'utf8'},(error,out)=>{if(error){reject(error);return;}try{resolve(JSON.parse(out.replace(/^\uFEFF/,'').trim()));}catch(error){reject(error);}})));
  }
  setEnabled(enabled) {if(typeof enabled!=='boolean')throw new Error('Invalid Enhanced Lookup preference.');this.enabled=enabled;this.generation++;if(!enabled){this.results.clear();for(const controller of this.controllers.values())controller.abort();}}
  async lookup(input) {
    if(!this.enabled)throw new Error('Turn on Enhanced Lookup in Preferences first.');
    const parsed=parseAddress(input);
    if(!parsed||scope(parsed.key)!=='Internet'||parsed.value<=1n|| (parsed.bits===32 && ((parsed.value>>28n)>=14n||(parsed.value>>24n)===0n)) || (parsed.bits===128 && ((parsed.value>>120n)===255n || (parsed.value>>125n)!==1n)))throw new Error('Enhanced Lookup accepts public destination IPs only.');
    // Pass a canonical address only, never a hostname, URL, command or options.
    const address=parsed.key,key=addressKey(address),prior=this.results.get(key);
    if(prior&&Date.now()-prior.savedAt<86400000)return prior;
    if(this.pending.has(key))return this.pending.get(key);
    if(this.pending.size>=2)throw new Error('Two lookups are already running. Try again shortly.');
    const generation=this.generation;
    const controller=new AbortController();this.controllers.set(key,controller);
    const task=this.run(address,controller.signal).then(raw=>{
      const network=raw.network&&typeof raw.network==='object'?Object.fromEntries(['name','owner','handle','startAddress','endAddress','country','source'].map(field=>[field,typeof raw.network[field]==='string'?raw.network[field].slice(0,512):null])):null;
      const result={address:key,savedAt:Date.now(),lookedUpAt:raw.lookedUpAt,hostnames:(raw.hostnames||[]).map(hostname).filter(Boolean).slice(0,16),network,errors:(raw.errors||[]).map(e=>String(e).slice(0,300)).slice(0,4)};
      if(this.enabled&&generation===this.generation){if(this.results.size>=4096)this.results.delete(this.results.keys().next().value);this.results.set(key,result);}
      return result;
    }).finally(()=>{this.pending.delete(key);this.controllers.delete(key);});this.pending.set(key,task);return task;
  }
  annotate(c) {return {...c,enhancedLookup:this.enabled?this.results.get(addressKey(c.remoteAddress))||null:null};}
}

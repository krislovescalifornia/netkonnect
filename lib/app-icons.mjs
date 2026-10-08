import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { appIdentity, hasWatercolor } from '../public/brands.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const idPattern=/^[a-f0-9]{64}$/;
const pngHeader=Buffer.from([137,80,78,71,13,10,26,10]);
const validPng = data => data.length>=24 && data.length<=256*1024 && data.subarray(0,8).equals(pngHeader)
  && data.readUInt32BE(16)>0 && data.readUInt32BE(16)<=256 && data.readUInt32BE(20)>0 && data.readUInt32BE(20)<=256;
export function windowsIconReader(root) {
  return requests => new Promise((resolve,reject)=>{
    const child=execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',join(root,'desktop','windows-icons.ps1')],
      {windowsHide:true,timeout:20000,maxBuffer:4*1024*1024,encoding:'utf8'},(error,out)=>{
        if(error)reject(error);else {try{resolve(JSON.parse(out.replace(/^\uFEFF/,'').trim()));}catch(error){reject(error);}}
      });
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(requests));
  });
}

// Only observed app identities enter the cache. Renderers receive opaque local
// image IDs, never a capability to extract icons from arbitrary paths.
export class AppIcons {
  constructor(directory,{readIcons,getFileIcon=null,clock=()=>Date.now()}={}) {
    this.directory=join(directory,'app-icons');this.readIcons=readIcons;this.getFileIcon=getFileIcon;this.clock=clock;
    this.entries=new Map();this.names=new Map();this.pending=new Map();this.fingerprints=new Map();this.queue=[];this.running=null;this.revision=0;this.savedRevision=-1;this.saving=null;this.error=null;
  }
  async load() {
    await mkdir(this.directory,{recursive:true});
    try {
      const saved=JSON.parse(await readFile(join(this.directory,'index.json'),'utf8'));
      for(const [name,id] of Object.entries(saved.names||{}).slice(-512))if(idPattern.test(id))this.names.set(name,id);
      for(const [key,entry] of Object.entries(saved.entries||{}).slice(-512))if(idPattern.test(key)&&idPattern.test(entry.id))this.entries.set(key,{id:entry.id,retryAt:Number.MAX_SAFE_INTEGER});
    } catch(error) {if(error.code!=='ENOENT')this.error='Saved Windows icon index is unavailable.';}
  }
  catalog() {return Object.fromEntries([...this.names].map(([name,id])=>[name,`/app-icons/${id}.png`]));}
  observe(snapshot) {
    const owners=new Map();
    for(const c of snapshot?.connections||[])if(c.pid>0) {
      const detail=snapshot.processDetails?.[c.pid];
      const owner=c.owner||detail;
      // ETW can expose a newer lifetime before the next process snapshot.
      const same=!owner?.startedAt||!detail?.startedAt||owner.startedAt===detail.startedAt;
      owners.set(`${c.app}|${c.pid}`,{...(same?detail:null),...owner,name:c.app,pid:c.pid});
    }
    for(const owner of owners.values())if(owner.name&&!hasWatercolor(appIdentity(owner.name)))this.request(owner).catch(()=>{});
  }
  async request(owner) {
    const name=String(owner.name).replace(/\.exe$/i,'').toLowerCase();
    const path=owner.path;
    // Drive type is checked by the OS helper before file access. Only metadata
    // explicitly marked fixed/local by our snapshot can be stat-ed here.
    if(path && (!/^[a-z]:\\/i.test(path)||path.slice(2).includes(':')))return null;
    let signature='';
    if(path&&owner.localPath===true) {
      const localKey=path.toLowerCase();let fingerprint=this.fingerprints.get(localKey);
      if(!fingerprint || fingerprint.retryAt<=this.clock()) {
        fingerprint={retryAt:this.clock()+300000,promise:stat(path).then(info=>`${info.size}|${info.mtimeMs}`).catch(()=>'')};
        this.fingerprints.set(localKey,fingerprint);
        if(this.fingerprints.size>512)this.fingerprints.delete(this.fingerprints.keys().next().value);
      }
      signature=await fingerprint.promise;
    }
    const key=hash(JSON.stringify([path?.toLowerCase()||null,signature,path?null:owner.pid,path?null:owner.startedAt,path?null:name,64]));
    const cached=this.entries.get(key);
    if(cached && cached.retryAt>this.clock()) {if(cached.id)this.assign(name,cached.id);else if(this.names.delete(name))this.revision++;return cached.id;}
    if(this.pending.has(key)){const id=await this.pending.get(key);if(id)this.assign(name,id);return id;}
    const promise=new Promise(resolve=>this.queue.push({owner:{path:owner.path||null,pid:owner.pid,name:owner.name,startedAt:owner.startedAt||null,localPath:owner.localPath===true},key,resolve}));
    this.pending.set(key,promise);
    this.startDrain();
    const id=await promise;if(id)this.assign(name,id);else if(this.names.delete(name))this.revision++;
    return id;
  }
  assign(name,id) {
    if(this.names.get(name)===id)return;
    this.names.delete(name);this.names.set(name,id);
    if(this.names.size>512)this.names.delete(this.names.keys().next().value);
    this.revision++;
  }
  startDrain() {
    if(this.running)return;
    this.running=Promise.resolve().then(()=>this.drain()).finally(()=>{this.running=null;if(this.queue.length)this.startDrain();});
  }
  async drain() {
    while(this.queue.length) {
      const tasks=this.queue.splice(0,32);let results=[];
      try {results=await this.readIcons(tasks.map(t=>({id:t.key,...t.owner})));}catch(error){this.error='Windows icon extraction is unavailable: '+error.message;}
      for(const task of tasks) {
        let id=null;
        try {
          const result=results.find(r=>r.id===task.key);
          let png=result?.png?Buffer.from(result.png,'base64'):null;
          // Built-in Electron fallback if the shell helper is unavailable. A
          // known resource-less executable deliberately retains its letter.
          if(!png&&result?.status!=='no-icon'&&this.getFileIcon&&task.owner.path&&task.owner.localPath) {
            const image=await this.getFileIcon(task.owner.path,{size:'normal'});
            if(!image.isEmpty())png=image.toPNG();
          }
          if(png&&validPng(png)) {
            id=hash(png);const file=join(this.directory,id+'.png');
            await writeFile(file+'.tmp',png);await rename(file+'.tmp',file);
          }
        } catch {}
        this.entries.delete(task.key);this.entries.set(task.key,{id,retryAt:id?Number.MAX_SAFE_INTEGER:this.clock()+600000});
        this.revision++;
        if(this.entries.size>512)this.entries.delete(this.entries.keys().next().value);
        this.pending.delete(task.key);task.resolve(id);
      }
    }
  }
  async read(id) {
    if(typeof id!=='string'||!idPattern.test(id))return null;
    try {const png=await readFile(join(this.directory,id+'.png'));if(validPng(png))return png;}catch{}
    // A removed or damaged file must not leave a successful cache entry that
    // prevents the next observation from extracting a replacement.
    for(const [key,entry] of this.entries)if(entry.id===id)this.entries.delete(key);
    for(const [name,value] of this.names)if(value===id)this.names.delete(name);
    this.revision++;return null;
  }
  async flush() {
    if(this.saving){await this.saving;return this.flush();}
    if(this.revision===this.savedRevision)return;
    const revision=this.revision;
    this.saving=(async()=>{
      const file=join(this.directory,'index.json');await writeFile(file+'.tmp',JSON.stringify({names:Object.fromEntries(this.names),entries:Object.fromEntries([...this.entries].filter(([,entry])=>entry.id))}));await rename(file+'.tmp',file);this.savedRevision=revision;
      const files=(await readdir(this.directory)).filter(name=>/^[a-f0-9]{64}\.png$/.test(name));
      if(files.length>1024) {
        const used=new Set([...this.names.values(),...[...this.entries.values()].map(e=>e.id)]);
        const unused=files.filter(name=>!used.has(name.slice(0,-4)));
        for(const name of unused.slice(0,files.length-1024))await unlink(join(this.directory,name)).catch(()=>{});
      }
    })();
    try{await this.saving;}catch(error){this.error='Windows icon cache could not be saved: '+error.message;}finally{this.saving=null;}
  }
  async close() {await Promise.all([...this.fingerprints.values()].map(f=>f.promise));while(this.running)await this.running;await this.flush();}
}

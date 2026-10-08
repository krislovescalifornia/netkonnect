import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { appIdentity, hasWatercolor } from '../public/brands.js';

function monthAfter(at) {
  const date = new Date(at), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+1);
  const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last)); return +date;
}
const eligible = (name,pid) => pid>0 && typeof name==='string' && name.length<=256 && !/^(Process \d+|Unattributed|System)$/i.test(name);
const count = n => Number.isFinite(n)&&n>=0?n:0;

// A single calendar-month campaign. Keep all candidates so a new app can enter
// the top ten; a reopened dashboard never restarts the collection window.
export class IconWishlist {
  constructor(directory) {
    this.file=join(directory,'watercolor-wishlist.json');this.apps=new Map();
    this.startedAt=null;this.endsAt=null;this.revision=0;this.savedRevision=-1;this.savedComplete=false;this.saving=null;this.error=null;this.disabled=false;
  }
  async load(now=Date.now()) {
    await mkdir(dirname(this.file),{recursive:true});
    try {
      const data=JSON.parse(await readFile(this.file,'utf8'));
      if(data.version!==1 || !Number.isFinite(data.startedAt) || data.endsAt!==monthAfter(data.startedAt) || !Array.isArray(data.apps))throw new Error('Invalid collection file');
      this.startedAt=data.startedAt;this.endsAt=data.endsAt;
      for(const app of data.apps.slice(0,4096)) if(typeof app.key==='string'&&typeof app.name==='string') {
        this.apps.set(app.key,{...app,activeSeconds:count(app.activeSeconds),received:count(app.received),sent:count(app.sent),
          ranges:(app.ranges||[]).filter(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)&&r[0]>=this.startedAt&&r[1]<=this.endsAt&&r[1]>r[0])});
      }
    } catch(error) {
      if(error.code!=='ENOENT') {this.disabled=true;this.error='Watercolor wishlist could not be read: '+error.message;return;}
      this.startedAt=now;this.endsAt=monthAfter(now);
    }
    await this.flush(now);
  }
  add(name,pid,start,end,received=0,sent=0) {
    if(this.disabled || !eligible(name,pid) || this.startedAt===null || end<=this.startedAt || start>=this.endsAt || end>this.endsAt)return;
    const identity=appIdentity(name);if(hasWatercolor(identity))return;
    start=Math.max(start,this.startedAt);end=Math.min(end,this.endsAt);if(end<=start)return;
    let app=this.apps.get(identity.key);
    if(!app) {
      if(this.apps.size>=4096)return;
      app={key:identity.key,name:identity.label,process:name,activeSeconds:0,received:0,sent:0,firstSeen:end,lastSeen:end,ranges:[]};this.apps.set(identity.key,app);
    }
    app.firstSeen=Math.min(app.firstSeen,end);app.lastSeen=Math.max(app.lastSeen,end);
    app.received+=count(received);app.sent+=count(sent);
    const ranges=[...app.ranges,[start,end]].sort((a,b)=>a[0]-b[0]),merged=[];
    for(const range of ranges) {
      const last=merged.at(-1);
      if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);
    }
    // Retain one minute of intervals for joining overlapping snapshot/ETW
    // observations. Commit older intervals without counting processes twice.
    app.ranges=[];
    for(const range of merged) {
      if(range[1]<end-60000)app.activeSeconds+=(range[1]-range[0])/1000;else app.ranges.push(range);
    }
    this.revision++;
  }
  observe(snapshot,elapsed,now=Date.now()) {
    if(!Number.isFinite(elapsed)||elapsed<=0)return;
    const apps=new Map();
    for(const c of snapshot?.connections||[]) if(c.protocol==='TCP'&&c.state==='Established'&&eligible(c.app,c.pid))apps.set(c.app,c.pid);
    for(const [name,pid] of apps)this.add(name,pid,now-Math.min(8,elapsed)*1000,now);
  }
  ingest(batch,snapshot,now=Date.now()) {
    if(batch.type!=='traffic'||!Number.isFinite(batch.elapsed)||batch.elapsed<=0 || now>this.endsAt)return;
    const apps=new Map();
    for(const flow of batch.flows||[]) {
      const name=flow.app||flow.owner?.name||snapshot?.processes?.[flow.pid];
      const received=count(flow.receivedBytes),sent=count(flow.sentBytes);
      if(!eligible(name,flow.pid)||!received&&!sent)continue;
      const prior=apps.get(name)||{pid:flow.pid,received:0,sent:0};prior.received+=received;prior.sent+=sent;apps.set(name,prior);
    }
    for(const [name,a] of apps)this.add(name,a.pid,now-Math.min(8,batch.elapsed)*1000,now,a.received,a.sent);
  }
  report(now=Date.now()) {
    const top10=[...this.apps.values()].filter(a=>!hasWatercolor(appIdentity(a.process))).map(a=>({
      key:a.key,name:a.name,process:a.process,activeSeconds:a.activeSeconds+a.ranges.reduce((s,[start,end])=>s+(end-start)/1000,0),
      received:a.received,sent:a.sent,firstSeen:a.firstSeen,lastSeen:a.lastSeen
    })).sort((a,b)=>b.activeSeconds-a.activeSeconds||(b.received+b.sent)-(a.received+a.sent)||a.name.localeCompare(b.name)).slice(0,10);
    return {startedAt:this.startedAt,endsAt:this.endsAt,complete:this.endsAt!==null&&now>=this.endsAt,metric:'network-active-seconds',top10,file:this.file,error:this.error};
  }
  async flush(now=Date.now()) {
    if(this.disabled || this.startedAt===null)return;
    if(this.saving){await this.saving;return this.flush(now);}
    if(this.savedRevision===this.revision && (now<this.endsAt||this.savedComplete))return;
    const revision=this.revision;
    this.saving=(async()=>{
      await writeFile(this.file+'.tmp',JSON.stringify({version:1,...this.report(now),apps:[...this.apps.values()]},null,2));
      await rename(this.file+'.tmp',this.file);this.savedRevision=revision;this.savedComplete=now>=this.endsAt;this.error=null;
    })();
    try {await this.saving;}catch(error){this.error='Watercolor wishlist could not be saved: '+error.message;}finally{this.saving=null;}
  }
}

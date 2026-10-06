import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { scope } from './network.mjs';
import { flowId } from './traffic.mjs';
import { serviceIdentity } from '../public/routes.js';
import { analyze } from '../public/analytics-model.js';

const HOUR=3600000, RETENTION=400*86400000;
const merge = (a=[],b=[]) => [...new Set([...a,...b])].slice(0,64);
export class AnalyticsStore {
  constructor(directory) { this.directory=directory;this.days=new Map();this.dirty=new Set();this.error=null;this.saving=null;this.observedHours=new Map();this.cityUsage=new Map();this.dirtyCities=new Set();this.cityRevision=0;this.savedCityRevision=0; }
  addCityUsage(record) {
    if(record.scope!=='Internet' || record.pids?.includes(0))return;
    const key=JSON.stringify([record.app,record.service.key,record.protocol,record.addresses[0],record.ports[0]]);
    const prior=this.cityUsage.get(key);
    this.cityUsage.set(key,{key,app:record.app,service:record.service,protocol:record.protocol,remoteAddress:record.addresses[0],remotePort:record.ports[0],scope:'Internet',pid:record.pids[0],domainCandidates:record.hostnames,
      receivedBytesTotal:(prior?.receivedBytesTotal||0)+record.received,sentBytesTotal:(prior?.sentBytesTotal||0)+record.sent});
    this.cityRevision++;
    this.dirtyCities.add(key);
  }
  seedCities() { for(const day of this.days.values())for(const record of day.values())this.addCityUsage(record); }
  async load(now=Date.now()) {
    try {
      await mkdir(this.directory,{recursive:true});
      const files=(await readdir(this.directory)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)&&Date.parse(n.slice(0,10))>=now-RETENTION);
      for(const file of files) {
        try { const data=JSON.parse(await readFile(join(this.directory,file),'utf8'));this.days.set(file.slice(0,10),new Map(data.records.map(r=>[r.key,r])));for(const h of data.coverage||[])this.observedHours.set(h.at,h.seconds); }
        catch { this.error=`Some saved history could not be read (${file}).`; }
      }
      try { const saved=JSON.parse(await readFile(join(this.directory,'cities.json'),'utf8'));this.cityUsage=new Map(saved.map(r=>[r.key,r])); }
      catch(error) { if(error.code==='ENOENT')this.seedCities();else this.error='Saved city totals could not be read: '+error.message; }
    } catch(error) { this.error='Historical storage is unavailable: '+error.message; }
  }
  ingest(batch,now=Date.now(),snapshot=null) {
    if(batch.type!=='traffic'||!Number.isFinite(batch.elapsed)||batch.elapsed<=0)return;
    const at=Math.floor(now/HOUR)*HOUR,day=new Date(at).toISOString().slice(0,10);
    if(!this.days.has(day))this.days.set(day,new Map());
    this.dirty.add(day);this.observedHours.set(at,Math.min(3600,(this.observedHours.get(at)||0)+batch.elapsed));
    const connections=new Map((snapshot?.connections||[]).map(c=>[flowId(c),c]));
    const dns=new Map();for(const d of snapshot?.dnsRecords||[]) { if(!dns.has(d.address))dns.set(d.address,[]);dns.get(d.address).push(d.name); }
    for(const c of batch.flows||[]) {
      const received=Math.max(0,Number(c.receivedBytes)||0),sent=Math.max(0,Number(c.sentBytes)||0);
      if(!received&&!sent)continue;
      const known=connections.get(flowId(c));
      const app=known?.app||snapshot?.processes?.[c.pid]||(c.pid?`Process ${c.pid}`:'Unattributed');
      const hostnames=known?.domainCandidates||dns.get(c.remoteAddress)||[];
      const service=serviceIdentity({...c,domainCandidates:hostnames});
      // Keep endpoint and owner dimensions until query time so an IP/PID search
      // never includes bytes from another destination or another process.
      const networkScope=scope(c.remoteAddress),key=JSON.stringify([at,app,service.key,c.protocol,networkScope,c.remoteAddress,c.remotePort,c.pid]);
      const records=this.days.get(day);
      if(!records.has(key))records.set(key,{key,at,app,service,protocol:c.protocol,scope:networkScope,received:0,sent:0,firstSeen:now,lastSeen:now,pids:[],ports:[],addresses:[],hostnames:[]});
      const r=records.get(key);r.received+=received;r.sent+=sent;r.lastSeen=now;
      this.addCityUsage({app,service,protocol:c.protocol,scope:networkScope,received,sent,addresses:[c.remoteAddress],ports:[c.remotePort],pids:[c.pid],hostnames});
      r.pids=merge(r.pids,[c.pid]);r.ports=merge(r.ports,[c.remotePort]);r.addresses=merge(r.addresses,[c.remoteAddress]);r.hostnames=merge(r.hostnames,hostnames);
    }
    for(const d of this.days.keys())if(Date.parse(d)<now-RETENTION){this.days.delete(d);this.dirty.delete(d);}
    for(const h of this.observedHours.keys())if(h<now-RETENTION)this.observedHours.delete(h);
  }
  async flush() {
    if(this.saving) { await this.saving; if(this.dirty.size || this.savedCityRevision!==this.cityRevision)return this.flush();return; }
    this.saving=(async()=>{
      if(this.savedCityRevision!==this.cityRevision) {
        const revision=this.cityRevision,file=join(this.directory,'cities.json');
        try { await writeFile(file+'.tmp',JSON.stringify([...this.cityUsage.values()]));await rename(file+'.tmp',file);this.savedCityRevision=revision; }
        catch(error) {this.error='City totals could not be saved: '+error.message;return;}
      }
      for(const day of [...this.dirty]) {
        this.dirty.delete(day);
        const file=join(this.directory,day+'.json');
        const data=JSON.stringify({version:1,records:[...(this.days.get(day)?.values()||[])],coverage:[...this.observedHours].filter(([at])=>new Date(at).toISOString().startsWith(day)).map(([at,seconds])=>({at,seconds}))});
        try { await writeFile(file+'.tmp',data);await rename(file+'.tmp',file); }
        catch(error) { this.dirty.add(day);this.error='History could not be saved: '+error.message;break; }
      }
    })();
    try { await this.saving; } finally {this.saving=null;}
  }
  query(options={},now=Date.now()) {
    const records=[...this.days.values()].flatMap(day=>[...day.values()]);
    const result=analyze(records,options,now);
    const hours=[...this.observedHours.keys()].sort((a,b)=>a-b);
    return {...result,archive:{from:hours[0]??null,to:hours.at(-1)??null,hours:hours.length,seconds:[...this.observedHours.values()].reduce((a,b)=>a+b,0),retentionDays:400,error:this.error},catalog:{apps:[...new Set(records.map(r=>r.app))].sort(),services:[...new Map(records.map(r=>[r.service.key,r.service])).values()].sort((a,b)=>a.label.localeCompare(b.label))}};
  }
}

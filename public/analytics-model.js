import { appName } from './brands.js';

export const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const defaults = () => ({ range:'month', query:'', app:'', service:'', from:'', to:'', weekday:'', month:'', year:'', hour:'', protocol:'', scope:'', direction:'total', min:'', max:'', unit:'GB', bucket:'day', sort:'total', timezone:Intl.DateTimeFormat().resolvedOptions().timeZone });
const formatters = new Map();
export function calendar(at, timezone = 'UTC') {
  if (!formatters.has(timezone)) formatters.set(timezone, new Intl.DateTimeFormat('en-CA', {timeZone:timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'long'}));
  const p = Object.fromEntries(formatters.get(timezone).formatToParts(new Date(at)).map(p=>[p.type,p.value]));
  return { date:`${p.year}-${p.month}-${p.day}`, month:Number(p.month), year:Number(p.year), hour:Number(p.hour), weekday:weekdays.indexOf(p.weekday) };
}

// Deliberately small grammar: free text remains searchable; recognized calendar
// and byte clauses become visible, editable filters rather than hidden rules.
export function parseSearch(query) {
  const filters = {}; let text = query.trim();
  const amount = /(?:more than|over|greater than|>)\s*(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|B)\b/i;
  text = text.replace(amount, (_,n,unit) => { filters.min=n; filters.unit=unit.toUpperCase(); return ''; });
  const maximum = /(?:less than|under|below|<)\s*(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|B)\b/i;
  text = text.replace(maximum, (_,n,unit) => { filters.max=String(Number(n)*1024**(['B','KB','MB','GB','TB'].indexOf(unit.toUpperCase())-['B','KB','MB','GB','TB'].indexOf(filters.unit||unit.toUpperCase()))); filters.unit ||= unit.toUpperCase(); return ''; });
  weekdays.forEach((day,i)=>{text=text.replace(new RegExp(`\\b${day}s?\\b`,'i'),()=>{filters.weekday=String(i);return '';});});
  months.forEach((month,i)=>{text=text.replace(new RegExp(`\\b${month}\\b`,'i'),()=>{filters.month=String(i+1);return '';});});
  text=text.replace(/\b(20\d{2})\b/,(_,year)=>{filters.year=year;return '';});
  text=text.replace(/\b(download(?:ed)?|incoming|upload(?:ed)?|outgoing)\b/i,word=>{filters.direction=/upload|outgoing/i.test(word)?'sent':'received';return '';});
  text=text.replace(/\b(hourly|per hour|daily|per day)\b/i,word=>{filters.bucket=/hour/i.test(word)?'hour':'day';return '';});
  filters.query=text.replace(/\b(all|the|times|when|used|using|on|in|a|an|bandwidth|traffic|search|for|show|me)\b/gi,' ').replace(/\s+/g,' ').trim();
  if (filters.month || filters.year) filters.range='all';
  return filters;
}
const metric = (row,direction) => direction==='received'?row.received:direction==='sent'?row.sent:row.received+row.sent;
const total = row => row.received+row.sent;
function add(map,key,row,extra={}) {
  if(!map.has(key))map.set(key,{key,received:0,sent:0,...extra});
  const value=map.get(key);value.received+=row.received;value.sent+=row.sent;return value;
}
export function analyze(records, options = {}, now = Date.now()) {
  const f={...defaults(),...options}, current=calendar(now,f.timezone);
  const earliest = f.range==='day'?current.date:f.range==='week'?calendar(now-6*86400000,f.timezone).date:f.range==='month'?current.date.slice(0,7)+'-01':f.range==='year'?current.year+'-01-01':'';
  const candidates=[],calendars=new Map();
  for(const r of records) {
    if(!calendars.has(r.at))calendars.set(r.at,calendar(r.at,f.timezone));
    const c=calendars.get(r.at);
    if(c.date<(f.from||earliest)||(f.to&&c.date>f.to)||r.at>now|| (f.weekday!==''&&c.weekday!==Number(f.weekday))||(f.month!==''&&c.month!==Number(f.month))||(f.year!==''&&c.year!==Number(f.year))||(f.hour!==''&&c.hour!==Number(f.hour)))continue;
    if((f.app&&r.app!==f.app)||(f.service&&r.service.key!==f.service)||(f.protocol&&r.protocol!==f.protocol)||(f.scope&&r.scope!==f.scope))continue;
    const haystack=[r.app,appName(r.app),r.service.label,r.protocol,r.scope,...(r.hostnames||[]),...(r.addresses||[]),...(r.pids||[]),...(r.ports||[])].join(' ').toLowerCase();
    if(!f.query.toLowerCase().split(/\s+/).every(token=>haystack.includes(token)))continue;
    candidates.push({...r,calendar:c});
  }
  // Thresholds apply AFTER adding every matching service for an app and period.
  // An app using 700 MB on each of two services exceeds 1 GB in that period.
  const periods=new Map();
  for(const r of candidates) {
    const period=f.bucket==='hour'?`${r.calendar.date} ${String(r.calendar.hour).padStart(2,'0')}:00 (${new Date(r.at).toISOString().slice(11,16)} UTC)`:r.calendar.date;
    const key=JSON.stringify([period,r.app]);r.periodKey=key;
    const p=add(periods,key,r,{period,app:r.app,at:r.at,services:new Set(),firstSeen:r.firstSeen,lastSeen:r.lastSeen});
    p.services.add(r.service.label);p.at=Math.max(p.at,r.at);p.firstSeen=Math.min(p.firstSeen,r.firstSeen);p.lastSeen=Math.max(p.lastSeen,r.lastSeen);
  }
  const multiplier=1024**['B','KB','MB','GB','TB'].indexOf(f.unit);
  const valid=new Set([...periods].filter(([,p])=>(f.min===''||metric(p,f.direction)>Number(f.min)*multiplier)&&(f.max===''||metric(p,f.direction)<Number(f.max)*multiplier)).map(([k])=>k));
  const selected=candidates.filter(r=>valid.has(r.periodKey));
  const apps=new Map(),services=new Map(),timeline=new Map(),days=new Map();
  const hours=Array.from({length:24},(_,key)=>({key,received:0,sent:0})),week=weekdays.map((label,key)=>({key,label,received:0,sent:0}));
  const heat=Array.from({length:7},()=>Array(24).fill(0));
  for(const r of selected) {
    add(apps,r.app,r,{label:appName(r.app)});add(services,r.service.key,r,{label:r.service.label,service:r.service});
    const key=f.range==='day'?String(r.calendar.hour).padStart(2,'0')+':00':r.calendar.date;
    const point=add(timeline,key,r,{apps:{}});point.apps[r.app]=(point.apps[r.app]||0)+total(r);
    add(days,r.calendar.date,r);
    hours[r.calendar.hour].received+=r.received;hours[r.calendar.hour].sent+=r.sent;
    week[r.calendar.weekday].received+=r.received;week[r.calendar.weekday].sent+=r.sent;
    heat[r.calendar.weekday][r.calendar.hour]+=total(r);
  }
  const descending=(a,b)=>total(b)-total(a)||a.key.localeCompare(b.key);
  const rankedApps=[...apps.values()].sort(descending),rankedServices=[...services.values()].sort(descending);
  const matches=[...periods.values()].filter(p=>valid.has(p.key)).map(p=>({...p,services:[...p.services]}));
  matches.sort(f.sort==='recent'?(a,b)=>b.at-a.at:(a,b)=>metric(b,f.direction)-metric(a,f.direction)||b.at-a.at);
  const received=selected.reduce((n,r)=>n+r.received,0),sent=selected.reduce((n,r)=>n+r.sent,0);
  const unique=field=>[...new Set(selected.flatMap(r=>r[field]||[]))].sort();
  return { received,sent,total:received+sent,apps:rankedApps,services:rankedServices,timeline:[...timeline.values()].sort((a,b)=>a.key.localeCompare(b.key)),hours,week,heat,matches,
    busiestDay:[...days.values()].sort(descending)[0]||null,busiestHour:[...hours].sort((a,b)=>total(b)-total(a))[0],activeDays:days.size,
    metadata:{pids:unique('pids'),addresses:unique('addresses'),ports:unique('ports'),hostnames:unique('hostnames'),protocols:[...new Set(selected.map(r=>r.protocol))],scopes:[...new Set(selected.map(r=>r.scope))],firstSeen:selected.length?selected.reduce((n,r)=>Math.min(n,r.firstSeen),Infinity):null,lastSeen:selected.length?selected.reduce((n,r)=>Math.max(n,r.lastSeen),0):null},
    filters:f };
}

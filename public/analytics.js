import { appName, appIdentity, brandBadge } from './brands.js';
import { defaults, parseSearch, weekdays, months } from './analytics-model.js';
import { demoAnalytics } from './analytics-demo.js';
import { localRequest } from './client.js';
import { coverageRibbon, observationCard } from './companion-ui.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>{const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<4){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${units[i]}`;};
const palette=['#4267ef','#b6ff00','#a58acb','#eebc33','#ef6456','#bcc6b1'];
const sum=r=>r.received+r.sent;
const stamp=n=>n==null?'—':new Date(n).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
const dateLabel=s=>new Date(s+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});
const hourLabel=n=>`${String(n).padStart(2,'0')}:00`;
const select=(name,label,values,value)=>`<label class="analytics-field"><span>${label}</span><select name="${name}">${values.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const input=(name,label,value,type='text',extra='')=>`<label class="analytics-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;

export class AnalyticsView {
  constructor(){this.filters=defaults();this.result=null;this.loading=false;this.error=null;this.mode=null;this.request=0;this.offset=0;this.drill=null;this.savedFilters=null;this.loadedAt=0;this.editing=false;this.filtersOpen=false;}
  async load(mode,render,{force=false}={}) {
    if(this.mode!==mode){this.result=null;this.mode=mode;this.loadedAt=0;this.offset=0;}
    if(this.loading&&!force)return;
    if(!force&&Date.now()-this.loadedAt<30000)return;
    const request=++this.request;this.loading=true;this.error=null;
    try {
      const options={...this.filters,offset:this.offset};
      if(options.from&&options.to&&options.from>options.to)throw new Error('Start date must be on or before end date.');
      if(options.min!==''&&options.max!==''&&Number(options.min)>=Number(options.max))throw new Error('Minimum usage must be lower than maximum usage.');
      let data;
      if(mode==='demo')data=demoAnalytics(options);
      else {const response=await localRequest('/api/analytics?'+new URLSearchParams(options),{signal:AbortSignal.timeout(20000)});data=await response.json();if(!response.ok)throw new Error(data.error||'History could not be loaded.');}
      if(request!==this.request)return;
      this.result=data;this.loadedAt=Date.now();
    } catch(error){if(request!==this.request)return;this.error=error.message;}
    finally {if(request===this.request){this.loading=false;render();}}
  }
  apply(form){const data=Object.fromEntries(new FormData(form));this.filters={...this.filters,...data,...parseSearch(data.query||'')};if(data.month||data.year)this.filters.range='all';if(this.drill&&this.filters[this.drill.type]!==this.drill.key){this.drill=null;this.savedFilters=null;}this.editing=false;this.offset=0;this.result=null;this.loadedAt=0;}
  reset(){this.filters=defaults();this.drill=null;this.savedFilters=null;this.offset=0;this.result=null;this.loadedAt=0;this.editing=false;this.filtersOpen=false;}
  preset(range){this.filters={...this.filters,range,from:'',to:''};this.offset=0;this.result=null;this.loadedAt=0;}
  drillInto(type,key,label){if(!this.drill)this.savedFilters={...this.filters};this.drill={type,key,label};this.filters={...this.filters,query:'',min:'',max:'',[type]:key};this.offset=0;this.result=null;this.loadedAt=0;}
  back(){this.filters=this.savedFilters||defaults();this.drill=null;this.savedFilters=null;this.offset=0;this.result=null;this.loadedAt=0;}
  async export(mode){
    if(mode!=='demo'&&window.netKonnect){
      try { const {csv}=await window.netKonnect.analytics({...this.filters,export:'csv'});const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='netkonnect-analytics.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
      catch(error){this.error=error.message;document.querySelector('#toast').textContent=error.message;document.querySelector('#toast').classList.add('show');}
      return;
    }
    if(mode!=='demo'){const a=document.createElement('a');a.href='/api/analytics?'+new URLSearchParams({...this.filters,export:'csv'});a.download='netkonnect-analytics.csv';a.click();return;}
    const data=demoAnalytics({...this.filters,export:'csv'});
    const cell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
    const rows=[['Period','Application','Received bytes','Sent bytes','Total bytes','Services','Timezone'],...data.matches.map(r=>[r.period,r.app,r.received,r.sent,sum(r),r.services.join('; '),data.filters.timezone])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='netkonnect-analytics-sample.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  render() {
    const f=this.filters,r=this.result;
    const catalog=r?.catalog||{apps:[],services:[]};
    const selectedApp=f.app&&!catalog.apps.includes(f.app)?[f.app]:[];
    return `<div class="analytics-page">${this.mode==='live'?coverageRibbon(r?.collectionTimeline)+observationCard(r?.observationSummary):''}<div class="analytics-toolbar"><div class="segmented" aria-label="Analytics time range">${[['day','Day'],['week','Week'],['month','Month'],['year','Year'],['all','All history']].map(([v,l])=>`<button data-analytics-range="${v}" class="${f.range===v?'selected':''}" aria-pressed="${f.range===v}">${l}</button>`).join('')}</div><span class="analytics-timezone">${esc(f.timezone)} · Calendar periods</span><button class="button" data-analytics-action="refresh" ${this.loading?'disabled':''}>Refresh</button><button class="button" data-analytics-action="export" ${!r?.matchCount?'disabled':''}>Export results ↓</button></div>
      <section class="panel analytics-search-panel"><div class="analytics-section-top"><div><h2>Ask your traffic history</h2><p>Find an app, service, IP, or a pattern across your days.</p></div><button class="text-button" data-analytics-action="reset">Reset filters</button></div>
      <form id="analytics-form"><div class="analytics-search"><span aria-hidden="true">⌕</span><input name="query" type="search" aria-label="Search traffic history" placeholder="Firefox used more than 1GB on a Tuesday in October" value="${esc(f.query)}"><button class="dark-button" type="submit">Search history →</button></div><div class="analytics-example"><span>TRY A QUESTION</span><button type="button" data-analytics-action="example">Firefox · over 1 GB · Tuesdays in October ↗</button></div>
      <details class="analytics-filters" ${this.filtersOpen?'open':''}><summary>Refine your search <span>Date, application, service, traffic, and usage</span></summary><div class="analytics-filter-grid">
      ${select('app','Application',[['','All applications'],...[...catalog.apps,...selectedApp].map(a=>[a,appName(a)])],f.app)}
      ${select('service','Service',[['','All services'],...catalog.services.map(s=>[s.key,s.label])],f.service)}
      ${input('from','From date',f.from,'date')}${input('to','Through date',f.to,'date')}
      ${select('weekday','Day of week',[['','Any day'],...weekdays.map((d,i)=>[i,d])],f.weekday)}
      ${select('month','Month',[['','Any month'],...months.map((m,i)=>[i+1,m])],f.month)}
      ${input('year','Year',f.year,'number','min="2000" max="2100" placeholder="Any year"')}
      ${select('hour','Hour of day',[['','Any hour'],...Array.from({length:24},(_,i)=>[i,hourLabel(i)])],f.hour)}
      ${select('direction','Measure',[['total','Download + upload'],['received','Download only'],['sent','Upload only']],f.direction)}
      ${input('min','More than',f.min,'number','min="0" step="any" placeholder="No minimum"')}
      ${input('max','Less than',f.max,'number','min="0" step="any" placeholder="No maximum"')}
      ${select('unit','Unit',['B','KB','MB','GB','TB'].map(u=>[u,u]),f.unit)}
      ${select('bucket','Usage threshold per',[['day','App / calendar day'],['hour','App / hour']],f.bucket)}
      ${select('protocol','Protocol',[['','All protocols'],['TCP','TCP'],['UDP','UDP']],f.protocol)}
      ${select('scope','Network scope',[['','All scopes'],['Internet','Internet'],['Local','Local network'],['Loopback','Loopback']],f.scope)}
      ${select('sort','Result order',[['total','Highest usage first'],['recent','Most recent first']],f.sort)}
      </div><div class="analytics-filter-foot"><span>Thresholds combine matching services per app and period. GB = 1,024³ bytes. Dates use your timezone.</span><button type="submit" class="button">Apply filters</button></div></details></form></section>
      ${this.error?`<div class="notice error-notice" role="alert">${esc(this.error)} <button data-analytics-action="refresh">Retry</button></div>`:''}
      ${this.loading?'<div class="analytics-loading" role="status">Reading traffic history…</div>':''}
      ${r?this.dashboard(r):!this.loading?'<div class="panel empty-cell">Open the history search to begin.</div>':''}</div>`;
  }
  dashboard(r) {
    const f=this.filters,archive=r.archive;
    const description=f.from||f.to?`${f.from||'Beginning of history'} → ${f.to||'Today'}`:{day:'Today',week:'Last 7 calendar days',month:'This calendar month',year:'This calendar year',all:'All saved history'}[f.range];
    const tags=[f.query&&`Search: ${f.query}`,f.app&&appName(f.app),f.service&&r.catalog.services.find(s=>s.key===f.service)?.label,f.weekday!==''&&weekdays[Number(f.weekday)],f.month!==''&&months[Number(f.month)-1],f.year,f.hour!==''&&hourLabel(Number(f.hour)),f.min!==''&&`> ${f.min} ${f.unit}`,f.max!==''&&`< ${f.max} ${f.unit}`,f.protocol,f.scope,f.direction!=='total'&&(f.direction==='sent'?'Upload only':'Download only')].filter(Boolean);
    return `<div class="analytics-context"><div><span class="eyebrow">${esc(description)}</span><p>${r.matchCount.toLocaleString()} matching app / ${f.bucket==='day'?'day':'hour'} records${this.mode==='demo'?' · Illustrative sample':''}</p></div><div class="analytics-tags">${tags.map(t=>`<span>${esc(t)}</span>`).join('')||'<span>All apps & services</span>'}</div></div>
    ${archive.error?`<div class="notice error-notice">${esc(archive.error)}</div>`:''}
    ${this.drill?`<div class="analytics-drill-heading"><button class="button" data-analytics-action="back">← Back to results</button><div><span class="eyebrow">${this.drill.type==='app'?'APPLICATION':'SERVICE'} HISTORY</span><h2>${esc(this.drill.label)}</h2></div></div>`:''}
    <div class="analytics-metrics"><article><span>Total bandwidth</span><strong>${size(r.total)}</strong><small>${r.apps.length} applications · ${r.services.length} services</small></article><article><span class="analytics-blue">↓ Downloaded</span><strong>${size(r.received)}</strong><small>${r.total?Math.round(r.received/r.total*100):0}% of matching traffic</small></article><article><span class="analytics-coral">↑ Uploaded</span><strong>${size(r.sent)}</strong><small>${r.total?Math.round(r.sent/r.total*100):0}% of matching traffic</small></article><article><span>Busiest day</span><strong class="analytics-day-value">${r.busiestDay?dateLabel(r.busiestDay.key):'—'}</strong><small>${r.busiestDay?size(sum(r.busiestDay))+' combined traffic':'No traffic in this selection'}</small></article></div>
    ${!r.matchCount?`<section class="panel analytics-empty"><span aria-hidden="true">◷</span><h2>${archive.from==null?'Your history starts here.':'No matching traffic.'}</h2><p>${archive.from==null?'Historical app usage builds while detailed capture is running. Start with Administrator capture to record download and upload bytes.':'Try a wider date range, another app, or a lower bandwidth threshold. Unobserved periods have no measurements.'}</p><button class="button" data-analytics-action="reset">Show all traffic</button></section>`:''}
    <div class="analytics-chart-grid"><section class="panel analytics-chart-card analytics-wide"><div class="analytics-section-top"><div><h2>Traffic over time</h2><p>Measured download and upload totals · ${f.range==='day'?'hourly':'daily'}</p></div><div class="analytics-legend"><span><i style="background:#4267ef"></i>Download</span><span><i style="background:#ef6456"></i>Upload</span></div></div>${trend(r.timeline)}<div class="analytics-chart-note">${r.activeDays} observed days with matching traffic · Charts show recorded traffic; gaps may be idle or unobserved.</div></section>
    <section class="panel analytics-chart-card analytics-wide"><div class="analytics-section-top"><div><h2>Applications over time</h2><p>Which apps shape your bandwidth? Select an app to explore its history.</p></div><span class="analytics-small">Download + upload</span></div>${appTimeline(r)}<div class="analytics-legend analytics-app-legend">${r.apps.slice(0,5).map((a,i)=>`<button data-analytics-app="${esc(a.key)}" data-analytics-label="${esc(a.label)}"><i style="background:${palette[i]}"></i>${esc(a.label)}</button>`).join('')}${r.apps.length>5?'<span><i style="background:#bcc6b1"></i>Other apps</span>':''}</div></section>
    <section class="panel analytics-chart-card analytics-wide"><div class="analytics-section-top"><div><h2>Your weekly rhythm</h2><p>Total traffic by day and hour · Select a square to search that time.</p></div><span class="analytics-small">Quiet <span class="heat-scale"></span> Busy</span></div>${heatmap(r)}<div class="analytics-chart-note">${r.matchCount?`Most traffic at ${hourLabel(r.busiestHour.key)} · ${size(sum(r.busiestHour))} across selected days`:'No observed activity in this selection'}</div></section>
    <section class="panel analytics-chart-card"><div class="analytics-section-top"><div><h2>Busiest hours</h2><p>When your network works hardest</p></div></div>${hourBars(r.hours)}</section>
    <section class="panel analytics-chart-card"><div class="analytics-section-top"><div><h2>Traffic by weekday</h2><p>Compare the shape of your week</p></div></div>${weekdayBars(r.week)}</section>
    <section class="panel analytics-chart-card"><div class="analytics-section-top"><div><h2>Applications</h2><p>Historical usage, including apps no longer running</p></div><span class="analytics-small">${r.apps.length} apps</span></div>${ranking(r.apps,'app',r.total)}</section>
    <section class="panel analytics-chart-card"><div class="analytics-section-top"><div><h2>Services & destinations</h2><p>Explore the destinations behind your traffic</p></div><span class="analytics-small">${r.services.length} services</span></div>${ranking(r.services,'service',r.total)}</section></div>
    ${this.drill||f.app||f.service?this.dossier(r):''}
    <section class="panel analytics-results"><div class="analytics-section-top"><div><h2>Matching history</h2><p>${f.bucket==='day'?'Calendar day':'Hourly'} totals per application · Select an app or service to drill down</p></div><span class="analytics-small">${r.matchCount.toLocaleString()} records</span></div><div class="table-wrap"><table class="connection-table"><thead><tr><th>PERIOD</th><th>APPLICATION</th><th>DOWNLOAD</th><th>UPLOAD</th><th>TOTAL</th><th>SERVICES</th></tr></thead><tbody>${r.matches.map(p=>`<tr><td><span class="analytics-period">${esc(p.period)}</span></td><td><button class="table-app" data-analytics-app="${esc(p.app)}" data-analytics-label="${esc(appName(p.app))}">${brandBadge(appIdentity(p.app))}<strong>${esc(appName(p.app))} ↗</strong></button></td><td>${size(p.received)}</td><td>${size(p.sent)}</td><td><strong>${size(sum(p))}</strong></td><td><span class="analytics-service-list">${p.services.map(label=>{const service=r.services.find(s=>s.label===label);return service?`<button data-analytics-service="${esc(service.key)}" data-analytics-label="${esc(label)}">${esc(label)} ↗</button>`:esc(label);}).join(', ')}</span></td></tr>`).join('')||'<tr><td colspan="6" class="empty-cell">No history matches these filters.</td></tr>'}</tbody></table></div><div class="analytics-pagination"><span>${r.matchCount?`${r.offset+1}–${r.offset+r.matches.length} of ${r.matchCount.toLocaleString()}`:'0 records'}</span><div><button class="button" data-analytics-action="previous" ${r.offset===0?'disabled':''}>← Previous</button><button class="button" data-analytics-action="next" ${r.offset+r.matches.length>=r.matchCount?'disabled':''}>Next →</button></div></div></section>
    <div class="analytics-coverage"><span class="analytics-coverage-dot"></span><div><strong>${this.mode==='demo'?'Illustrative history · 365 sample days':archive.from==null?'Waiting for measured history':`Saved history since ${stamp(archive.from)}`}</strong><p>${this.mode==='demo'?'Sample records demonstrate a full year of patterns and search results.':`${archive.hours.toLocaleString()} observed hourly windows · ${(archive.seconds/3600).toFixed(1)} capture hours · Last observed ${stamp(archive.to)}. History is saved on this computer and survives service restarts. Up to 400 days are searchable.`} ${this.mode==='live'?'Capture gaps and event loss can leave incomplete totals. Hourly records are assigned to the interval’s ending hour; metadata lists retain up to 64 clues per hourly record.':''}</p></div></div>`;
  }
  dossier(r){const m=r.metadata,label=this.drill?.label||(this.filters.app?appName(this.filters.app):r.catalog.services.find(s=>s.key===this.filters.service)?.label||this.filters.service);return `<section class="panel analytics-dossier"><div class="analytics-section-top"><div><h2>What we know about ${esc(label)}</h2><p>Clues retained with the traffic in this selection</p></div></div><div class="analytics-dossier-grid">${[['First observed',stamp(m.firstSeen)],['Last observed',stamp(m.lastSeen)],['Process IDs',m.pids.join(', ')||'—'],['Protocols',m.protocols.join(', ')||'—'],['Remote ports',m.ports.join(', ')||'—'],['Network scopes',m.scopes.join(', ')||'—'],['Destination addresses',m.addresses.join(', ')||'—'],['Cached hostname clues',m.hostnames.join(', ')||'—']].map(([k,v])=>`<div><span>${k}</span><p>${esc(v)}</p></div>`).join('')}</div><div class="analytics-chart-note">Process IDs identify observed owners and may be reused by Windows. DNS cache matches are destination clues; they do not identify content, tabs, or transferred files.</div></section>`;}
}

function chartEmpty(){return '<div class="analytics-chart-empty">No measured traffic in this selection</div>';}
function trend(points) {
  if(!points.length)return chartEmpty();
  const max=Math.max(...points.map(p=>Math.max(p.received,p.sent)),1),w=1000,left=90,right=970,base=220,top=25;
  const x=i=>left+(points.length===1?.5:i/(points.length-1))*(right-left),y=n=>base-n/max*(base-top);
  const segments=key=>{
    const groups=[];let group=[];
    points.forEach((p,i)=>{const gap=i>0&&p.key.includes('-')&&Date.parse(p.key)-Date.parse(points[i-1].key)>86400000;if(gap){groups.push(group);group=[];}group.push([p,i]);});groups.push(group);
    return groups.map(group=>`<polyline points="${group.map(([p,i])=>`${x(i)},${y(p[key])}`).join(' ')}" fill="none" stroke="${key==='received'?'#4267ef':'#ef6456'}" stroke-width="2.5"/>`).join('');
  };
  return `<svg class="analytics-svg" viewBox="0 0 ${w} 265" role="img" aria-label="Download and upload byte totals over time">${[0,.25,.5,.75,1].map(n=>`<line x1="${left}" x2="${right}" y1="${y(n*max)}" y2="${y(n*max)}" stroke="#e7ebe1" stroke-dasharray="3 5"/><text x="78" y="${y(n*max)+4}" text-anchor="end">${size(n*max)}</text>`).join('')}${segments('received')}${segments('sent')}${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.received)}" r="${points.length<45?3:1.5}" fill="#4267ef"><title>${esc(p.key)} · Download ${size(p.received)} · Upload ${size(p.sent)}</title></circle><circle cx="${x(i)}" cy="${y(p.sent)}" r="${points.length<45?3:1.5}" fill="#ef6456"><title>${esc(p.key)} · Upload ${size(p.sent)}</title></circle>`).join('')}${[...new Set([0,Math.floor((points.length-1)/2),points.length-1])].map(i=>`<text x="${x(i)}" y="251" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${esc(points[i].key)}</text>`).join('')}</svg>`;
}
function appTimeline(r){
  if(!r.timeline.length)return chartEmpty();
  // Reduce a long year to weekly-width columns, while retaining precise totals.
  const stride=Math.max(1,Math.ceil(r.timeline.length/60)),points=[];
  for(let i=0;i<r.timeline.length;i+=stride){const slice=r.timeline.slice(i,i+stride),apps={};for(const p of slice)for(const [a,n] of Object.entries(p.apps))apps[a]=(apps[a]||0)+n;points.push({label:slice[0].key+(slice.length>1?' – '+slice.at(-1).key:''),apps});}
  const max=Math.max(...points.map(p=>Object.values(p.apps).reduce((a,b)=>a+b,0)),1),width=880/points.length,top=r.apps.slice(0,5);
  return `<svg class="analytics-svg" viewBox="0 0 1000 240" role="img" aria-label="Stacked application bandwidth totals over time">${[0,.5,1].map(n=>`<text x="78" y="${205-n*175}" text-anchor="end">${size(max*n)}</text><line x1="90" x2="970" y1="${200-n*175}" y2="${200-n*175}" stroke="#e7ebe1"/>`).join('')}${points.map((p,i)=>{let height=0;const values=top.map((a,j)=>({key:a.key,label:a.label,bytes:p.apps[a.key]||0,color:palette[j]}));const other=Object.entries(p.apps).filter(([a])=>!top.some(t=>t.key===a)).reduce((n,[,b])=>n+b,0);if(other)values.push({label:'Other apps',bytes:other,color:palette[5]});return values.map(a=>{const h=a.bytes/max*175;height+=h;return `<rect x="${90+i*width}" y="${200-height}" width="${Math.max(1,width-3)}" height="${h}" rx="1" fill="${a.color}"><title>${esc(p.label)} · ${esc(a.label)} · ${size(a.bytes)}</title></rect>`;}).join('');}).join('')}<text x="90" y="229">${esc(points[0].label)}</text><text x="970" y="229" text-anchor="end">${esc(points.at(-1).label)}</text></svg>`;
}
function heatmap(r){const max=Math.max(...r.heat.flat(),1);return `<div class="analytics-heat-scroll"><div class="analytics-heatmap"><span></span>${Array.from({length:24},(_,h)=>`<span class="analytics-heat-hour">${h%3===0?hourLabel(h):''}</span>`).join('')}${[1,2,3,4,5,6,0].map(d=>`<span class="analytics-heat-day">${weekdays[d].slice(0,3)}</span>${r.heat[d].map((n,h)=>`<button class="analytics-heat-cell" data-analytics-weekday="${d}" data-analytics-hour="${h}" style="background:${n?`rgba(83, 137, 65, ${.15+.85*n/max})`:'#f0f3ec'}" aria-label="${weekdays[d]} at ${hourLabel(h)}: ${size(n)}" title="${weekdays[d]} · ${hourLabel(h)} · ${size(n)}"></button>`).join('')}`).join('')}</div></div>`;}
function hourBars(hours){const max=Math.max(...hours.map(sum),1);return `<div class="analytics-hour-bars">${hours.map(h=>`<button data-analytics-hour="${h.key}" title="${hourLabel(h.key)} · ${size(sum(h))}" aria-label="Filter ${hourLabel(h.key)}: ${size(sum(h))}"><span class="analytics-hour-column"><i style="height:${sum(h)/max*100}%"></i></span><small>${h.key%4===0?String(h.key).padStart(2,'0'):''}</small></button>`).join('')}</div><div class="analytics-chart-note">Hourly totals across the selected dates</div>`;}
function weekdayBars(week){const max=Math.max(...week.map(sum),1);return `<div class="analytics-week-bars">${[1,2,3,4,5,6,0].map(i=>{const d=week[i];return `<button data-analytics-weekday="${i}" aria-label="Filter ${d.label}"><span>${d.label.slice(0,3)}</span><div><i style="width:${d.received/max*100}%;background:#4267ef"></i><i style="width:${d.sent/max*100}%;background:#ef6456"></i></div><strong>${size(sum(d))}</strong></button>`;}).join('')}</div>`;}
function ranking(rows,type,total){return `<div class="analytics-rankings">${rows.slice(0,12).map(a=>`<button data-analytics-${type}="${esc(a.key)}" data-analytics-label="${esc(a.label)}"><div class="analytics-ranking-identity">${brandBadge(type==='app'?appIdentity(a.key):a.service)}<span><strong>${esc(a.label)}</strong><small>↓ ${size(a.received)} · ↑ ${size(a.sent)}</small></span><b>${size(sum(a))} <small>↗</small></b></div><div class="analytics-ranking-track"><i style="width:${total?sum(a)/total*100:0}%"></i></div></button>`).join('')||'<div class="analytics-chart-empty">No matching usage</div>'}${rows.length>12?`<div class="analytics-chart-note">Top 12 of ${rows.length} · Search to explore any other ${type}</div>`:''}</div>`;}

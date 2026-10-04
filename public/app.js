import { appIdentity, appName, brandBadge } from './brands.js';
import { renderNetworkMap, routeDetails, TransportAnimator } from './map.js';
import { buildRoutes, RouteTrafficView, serviceIdentity } from './routes.js';
import { AnalyticsView } from './analytics.js';
import { localRequest } from './client.js';
import { companionPreferences, handleCompanionAction, setupSlot, setupVersion, refreshSetupStatus, preferencesAlert } from './companion-ui.js';
import { speedUnit, nextSpeedUnit, speedButton } from './speed.js';
import { releaseYear } from './version.js';
const analyticsView = new AnalyticsView();
const transportAnimator = new TransportAnimator();
const trafficSource = () => state.mode+'|'+(state.service?.instanceId || '')+'|'+(state.snapshot?.traffic?.usageStartedAt || '');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ overview:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>', activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>', connections:'<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a3 3 0 013 3v6M6 9v9h9"/>', secrets:'<path d="M4 9h16M8 9l2-6h4l2 6M3 15h18"/><circle cx="8" cy="16" r="3"/><circle cx="16" cy="16" r="3"/><path d="M11 16h2"/>', adapters:'<path d="M8 3v6m8-6v6M5 9h14v4a7 7 0 01-14 0zM12 20v2"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>', down:'<path d="M12 4v16m-5-5 5 5 5-5"/>', up:'<path d="M12 20V4m-5 5 5-5 5 5"/>', chevron:'<path d="m9 5 7 7-7 7"/>', pause:'<path d="M8 5v14M16 5v14"/>', play:'<path d="m8 4 12 8-12 8z"/>', download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>', wifi:'<path d="M2 8a16 16 0 0120 0M5 12a11 11 0 0114 0M8 16a6 6 0 018 0"/><circle cx="12" cy="20" r=".6"/>', globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>', star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.5l-5.7 3.1 1.1-6.4L2.8 9.7l6.4-.9z"/>', laptop:'<rect x="5" y="3" width="14" height="13" rx="2"/><path d="M2 20h20l-3-4H5z"/>', check:'<path d="m5 12 4 4L19 6"/>' })[name] || '<circle cx="12" cy="12" r="8"/>'}</svg>`;
const restartIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6"/></svg>';
const restartButton = () => `<button class="button restart-service" data-action="restart-service" ${state.restarting||state.mode==='demo'||!state.service?.instanceId?'disabled':''} title="Restart live monitoring; saved analytics history is preserved">${restartIcon}${state.restarting?'Restarting…':'Restart Service'}</button>`;
const colors = ['#4267ef','#ef6456','#eebc33','#b6ff00'];
let prefs;
try { prefs = JSON.parse(localStorage.getItem('netkonnect-preferences') || '{}'); } catch { prefs = {}; }
const state = { trafficView:new RouteTrafficView(), page:'overview', mode:'live', snapshot:null, paused:false, query:'', scope:'all', protocol:'all', secretApp:null, watched:new Set(prefs.watched || []), motion:prefs.motion !== false, range:60, error:null, collecting:true, interval:2000, detail:null, mapApp:'all', mapDetail:'service', mapVehicle:'auto', mapQuery:'', mapLimit:10, mapExpanded:new Set(), mapSort:['total','download','upload','app','service','connections'].includes(prefs.mapSort)?prefs.mapSort:'total', mapSortDirection:prefs.mapSortDirection==='asc'?'asc':'desc', service:null, restarting:false };
const pages = [['overview','Traffic Management'],['activity','Data Analytics'],['connections','Connections'],['secrets','Little Secrets'],['adapters','Network adapters']];
const bytes = n => { if (n == null) return '—'; const units=['B','KB','MB','GB','TB']; let i=0; while(n>=1024 && i<4){n/=1024;i++;} return `${n.toFixed(i ? 1 : 0)} <small>${units[i]}</small>`; };
let rateUnit = speedUnit(prefs.speedUnit);
const rate = n => speedButton(n, rateUnit);
const time = s => new Date(s).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
const relative = s => { const seconds = Math.max(0, Math.round((Date.now()-Date.parse(s))/1000)); return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds/60)}m ago`; };
const connections = () => state.snapshot?.connections || [];
const outbound = () => connections().filter(c => c.scope === 'Internet' && c.state !== 'Listen');
const grouped = () => { const apps=new Map(); for(const c of outbound()){ if(c.pid===0)continue; if(!apps.has(c.app))apps.set(c.app,{ name:c.app, connections:[], destinations:new Set(), pids:new Set() }); const a=apps.get(c.app);a.connections.push(c);a.destinations.add(c.remoteAddress);a.pids.add(c.pid); } return [...apps.values()].sort((a,b)=>b.connections.length-a.connections.length); };
const appBadge = name => brandBadge(appIdentity(name));
function persist(){ try { localStorage.setItem('netkonnect-preferences',JSON.stringify({ watched:[...state.watched],motion:state.motion,mapSort:state.mapSort,mapSortDirection:state.mapSortDirection,speedUnit:rateUnit })); } catch { toast('Local preference storage is unavailable; this setting lasts for this session.'); } }
function toast(message){ $('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3500); }

function shell(){
  $('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="#overview" aria-label="netKonnect Traffic Management"><span class="brand-mark" aria-hidden="true"></span>net<span class="brand-light">Konnect</span><span class="brand-dot">®</span></a>
    <label class="global-search">${icon('search',17)}<input id="global-search" placeholder="Find an app or destination" aria-label="Find an app or destination" value="${esc(state.query)}"><kbd>/</kbd></label>
    <nav aria-label="Dashboard">${pages.map(([id,label])=>`<button aria-label="${label}" data-page="${id}" class="nav-item ${state.page===id?'active':''}">${icon(id)}<span>${label}</span>${id==='secrets'?'<span class="nav-new">NEW</span>':''}</button>`).join('')}</nav>
    <div class="sidebar-collection"><div id="network-controls">${networkControls()}</div></div>
    <div class="side-bottom"><button aria-label="Preferences" data-action="settings" class="nav-item">${icon('settings')}<span>Preferences</span><span data-preferences-alert>${preferencesAlert()}</span></button><div class="version">kneurons made this for you <span>© ${releaseYear} kneurons · <span data-app-version>v${esc(setupVersion())}</span></span></div></div>
    </aside><div class="workspace"><main id="main"></main><footer><span><i class="tiny-dot"></i> Collected locally · Nothing leaves this app</span><span>Take the scenic route. <span class="footer-arrow">↗</span></span></footer></div><div id="overlay"></div>`;
  renderContent();
}
function networkControls() { return `<span class="live-pill ${state.error || state.restarting || state.collecting&&!state.snapshot?'muted':''}" role="status"><i></i>${state.restarting?'Restarting service':state.error?'Collector offline':state.collecting&&!state.snapshot?'Connecting':'Live network'}</span><div class="sidebar-service-buttons"><button class="button" data-action="pause" aria-label="${state.paused?'Resume':'Pause'} updates" aria-pressed="${state.paused}" title="${state.paused?'Resume':'Pause'} display updates">${icon(state.paused?'play':'pause',15)}${state.paused?'Resume':'Pause'}</button>${restartButton()}</div>${state.paused?'<p class="display-status">Display paused · Collection continues</p>':''}`; }
function refreshNetworkControls() { const controls=$('#network-controls'); if(!controls)return; const markup=networkControls(); if(controls.controlsMarkup===markup)return; const action=controls.contains(document.activeElement)?document.activeElement.dataset.action:null; controls.innerHTML=markup; controls.controlsMarkup=markup; if(action)controls.querySelector(`[data-action="${action}"]`)?.focus({preventScroll:true}); }
function heading(kicker,title,subtitle,action='') { return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${subtitle}</p></div>${action?`<div class="heading-actions">${action}</div>`:''}</div>`; }
function statusBanner(){ if(state.restarting)return `<div class="notice" role="status">${restartIcon} Restarting the service… This page will reconnect automatically.</div>`; if(state.error)return `<div class="notice error-notice">${icon('info',17)} ${esc(state.error)}${state.snapshot?' · Showing the last successful snapshot.':''}</div>`; const issues=state.snapshot?.issues || [];return issues.length?`<div class="notice">${icon('info',17)} ${issues.map(esc).join(' · ')}</div>`:''; }
function metrics(){ const s=state.snapshot; const apps=grouped(); return `<div class="metrics"><article class="metric"><span class="metric-label">Incoming traffic <span class="metric-icon blue">${icon('down',16)}</span></span><div class="metric-value">${rate(s?.totals.ready?s.totals.receiveRate:null)}</div><div class="metric-spark blue-spark" role="img" aria-label="Incoming traffic over recent samples">${spark(s?.history.map(p=>p.receiveRate)||[],colors[0])}</div></article><article class="metric"><span class="metric-label">Outgoing traffic <span class="metric-icon orange">${icon('up',16)}</span></span><div class="metric-value">${rate(s?.totals.ready?s.totals.sendRate:null)}</div><div class="metric-spark" role="img" aria-label="Outgoing traffic over recent samples">${spark(s?.history.map(p=>p.sendRate)||[],colors[1])}</div></article><article class="metric"><span class="metric-label">Outside connections <span class="metric-icon green">${icon('globe',16)}</span></span><div class="metric-value">${outbound().length}<small> connections</small></div><span class="metric-foot">${new Set(outbound().map(c=>c.remoteAddress)).size} destinations</span><div class="metric-decoration">↗</div></article><article class="metric"><span class="metric-label">Apps on the move <span class="metric-icon yellow">${icon('connections',16)}</span></span><div class="metric-value">${apps.length}<small> applications</small></div><span class="metric-foot">${state.snapshot?`${state.snapshot.adapters.filter(a=>a.status==='Up').length} active adapters`:'Waiting for the first snapshot'}</span><div class="mini-apps">${apps.slice(0,3).map((a,i)=>appBadge(a.name,i)).join('')}</div></article></div>`; }
function spark(values,color){ if(values.length<2)return `<svg viewBox="0 0 120 32"><path d="M0 28H120" stroke="${color}" opacity=".35"/></svg>`;const v=values.slice(-24), max=Math.max(...v,1);return `<svg viewBox="0 0 120 32" preserveAspectRatio="none"><polyline points="${v.map((n,i)=>`${i*120/(v.length-1)},${29-n/max*25}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/></svg>`; }
function networkMap(){ return renderNetworkMap({state,icon,rate,bytes,esc}); }
function destinationLabel(c,max=40){ const label=serviceIdentity(c).label; return label?.length>max?label.slice(0,max-1)+'…':label; }
function overview(){const apps=grouped();return statusBanner()+metrics()+networkMap()+`<div class="overview-bottom"><section class="panel"><div class="panel-head"><div><h2>Recent departures</h2><p>Connections spotted on this journey.</p></div><button class="text-button" data-page="connections">View all ${icon('arrow',16)}</button></div>${connectionTable([...outbound()].sort((a,b)=>Date.parse(b.firstSeen)-Date.parse(a.firstSeen)).slice(0,4),true)}</section><section class="secret-postcard"><div class="secret-card-top"><span class="secret-stamp">PSSST…</span>${icon('secrets',35)}</div><h2>Apps have<br>little secrets.</h2><p>Meet the outside connections your apps make behind the scenes.</p><div class="secret-summary"><span class="secret-count">${apps.length}</span><span>apps with a story<br>to tell right now</span></div><button class="dark-button" data-page="secrets">Take a little peek ${icon('arrow',17)}</button></section></div>`;}
function connectionTable(list,compact=false){ return `<div class="table-wrap"><table class="connection-table"><thead><tr><th>APPLICATION</th><th>DESTINATION</th>${compact?'':'<th>PROTOCOL / PORT</th><th>LOCAL ENDPOINT</th>'}<th>STATUS</th><th>${compact?'FIRST SEEN':'SCOPE'}</th><th></th></tr></thead><tbody>${list.map((c,i)=>`<tr><td><button class="table-app" ${c.pid===0?`data-connection="${esc(c.id)}"`:`data-app="${esc(c.app)}"`}>${appBadge(c.app,i)}<span><strong>${esc(appName(c.app))}</strong><small>PID ${c.pid}</small></span></button></td><td><span class="destination-cell service-destination">${brandBadge(serviceIdentity(c))}<span>${esc(destinationLabel(c))}</span></span><small class="sub-cell">${c.domainCandidates?.length?'DNS cache match · ':''}${esc(c.remoteAddress)}${c.remotePort?':'+c.remotePort:''}</small></td>${compact?'':`<td><span class="protocol">${esc(c.protocol)}</span> <span class="mono">${c.remotePort||'—'}</span></td><td class="mono endpoint">${esc(c.localAddress)}:${c.localPort}</td>`}<td><span class="status-tag ${c.state==='Established'?'connected':''}">${c.state==='Established'?'<i></i>':''}${esc(c.state)}</span></td><td class="${compact?'mono':'scope-cell'}">${compact?relative(c.firstSeen):esc(c.scope)}</td><td><button class="row-detail" data-connection="${esc(c.id)}" title="Inspect connection" aria-label="Inspect ${esc(appName(c.app))} connection">${icon('arrow',16)}</button></td></tr>`).join('')||`<tr><td colspan="${compact?5:7}" class="empty-cell">${state.snapshot?'No connections match this view. Try another filter.':'Waiting for the local collector…'}</td></tr>`}</tbody></table></div>`; }
function filtered(){ return connections().filter(c=> (state.scope==='all'||(state.scope==='watched'?state.watched.has(c.app):c.scope===state.scope))&&(state.protocol==='all'||c.protocol===state.protocol)&&[c.app,appName(c.app),serviceIdentity(c).label,c.pid,c.remoteAddress,c.localAddress,...(c.domainCandidates||[])].join(' ').toLowerCase().includes(state.query.toLowerCase())); }
function connectionsPage(){const list=filtered();return heading('THE CONNECTION MANIFEST','Every route, accounted for.','The familiar netstat details, with a little more room to breathe.')+statusBanner()+`<div class="toolbar"><div class="segmented">${[['all','All routes'],['Internet','Outside'],['Local','Local'],['Loopback','Loopback'],['watched','Watchlist']].map(([v,l])=>`<button data-scope="${v}" class="${state.scope===v?'selected':''}">${l}</button>`).join('')}</div><div class="toolbar-right"><select id="protocol-filter" aria-label="Filter protocol"><option value="all">All protocols</option><option ${state.protocol==='TCP'?'selected':''}>TCP</option><option ${state.protocol==='UDP'?'selected':''}>UDP</option></select><button class="button" data-action="export">${icon('download',15)} Export CSV</button></div></div><section class="panel"><div class="table-summary"><span><strong>${list.length}</strong> connections <span class="muted">· ${state.snapshot?`Snapshot ${time(state.snapshot.timestamp)}`:'Loading snapshot'}</span></span><label class="inline-search">${icon('search',16)}<input id="table-search" value="${esc(state.query)}" placeholder="Filter apps, IPs, or hostnames" aria-label="Filter connections"></label></div>${connectionTable(list.slice(0,500))}${list.length>500?'<div class="table-limit">Showing the first 500 matches. Narrow the filter or export the full results.</div>':''}</section><div class="plain-note">${icon('info',16)} UDP peers and speeds appear when detailed capture is active; bound endpoints have no remote peer. DNS cache matches are clues, and may contain multiple possible hostnames.</div>`; }
function activityPage(){ return heading('EVERY BYTE HAS A HISTORY','Data Analytics.','Explore your traffic across days, weeks, months, and years.')+statusBanner()+analyticsView.render(); }
function secretsPage(){const apps=grouped();if(!state.secretApp || !apps.find(a=>a.name===state.secretApp))state.secretApp=apps[0]?.name;const app=apps.find(a=>a.name===state.secretApp); const dests=new Map();app?.connections.forEach(c=>{if(!dests.has(c.remoteAddress))dests.set(c.remoteAddress,[]);dests.get(c.remoteAddress).push(c);});return heading('A LITTLE HEALTHY CURIOSITY','Little Secrets.','Your apps are chatty. Get to know their outside conversations.')+statusBanner()+`<div class="secrets-banner"><div class="secrets-art">${icon('secrets',48)}<span>SHH!</span></div><div><strong>Behind every app, a world of connections.</strong><p>See who they’re talking to. Follow the clues. Keep an eye on the unexpected.</p></div><span class="outline-tag">FOR CURIOUS EYES</span></div><div class="secrets-layout"><section class="panel app-manifest"><div class="manifest-heading"><h2>The usual suspects</h2><span>${apps.length} apps</span></div>${apps.map((a,i)=>`<button class="suspect ${a.name===state.secretApp?'selected':''}" data-suspect="${esc(a.name)}">${appBadge(a.name,i)}<span><strong>${esc(appName(a.name))} ${state.watched.has(a.name)?'<span class="watch-dot" title="On your watchlist"></span>':''}</strong><small>${a.destinations.size} destinations · ${a.connections.length} connections</small></span>${icon('chevron',14)}</button>`).join('')||'<div class="empty-cell">No outside conversations spotted yet.</div>'}<div class="manifest-footer">${icon('secrets',18)} Curiosity, without the guesswork.</div></section><section class="panel dossier">${app?`<div class="dossier-heading">${appBadge(app.name,apps.indexOf(app))}<div><div class="eyebrow">APPLICATION DOSSIER</div><h2>${esc(appName(app.name))}</h2><span class="mono">PID ${[...app.pids].join(', ')}</span></div><button class="button ${state.watched.has(app.name)?'watched':''}" data-watch="${esc(app.name)}">${icon('star',16)} ${state.watched.has(app.name)?'Watching':'Add to watchlist'}</button></div><div class="dossier-metrics"><div><strong>${app.connections.length}</strong><span>outside connections</span></div><div><strong>${app.destinations.size}</strong><span>unique destinations</span></div><div><strong>${app.connections.filter(c=>c.state==='Established').length}</strong><span>established right now</span></div></div><div class="dossier-title"><h3>Where the whispers go</h3><span class="tiny-label">${dests.size} DESTINATIONS</span></div>${[...dests].map(([ip,cs],i)=>`<button class="whisper-route" data-connection="${esc(cs[0].id)}">${brandBadge(serviceIdentity(cs[0]))}<span class="whisper-name"><strong>${esc(destinationLabel(cs[0],60))}</strong><small class="mono">${esc(ip)} · Ports ${[...new Set(cs.map(c=>c.remotePort))].join(', ')}</small></span><span class="whisper-count">${cs.length} route${cs.length===1?'':'s'}</span>${icon('chevron',15)}</button>`).join('')}<div class="dossier-note">${icon('info',17)}<p>An unfamiliar connection is a clue, not a verdict. Hostnames come from your DNS cache and don’t establish what data was sent or whether a connection was expected. This app observes; it doesn’t block connections.</p></div>`:'<div class="empty-cell">The case files are empty. New outside connections will appear here.</div>'}</section></div>`; }
function adaptersPage(){const adapters=state.snapshot?.adapters||[];return heading('THE GATES TO THE WORLD','Meet your adapters.','Every journey starts somewhere. These are your departure gates.')+statusBanner()+`<div class="adapter-grid">${adapters.map(a=>`<section class="panel adapter-card"><div class="adapter-card-top"><span class="adapter-big-icon ${a.status==='Up'?'is-up':''}">${icon(/wi-fi|wireless/i.test(a.name+' '+a.description)?'wifi':'adapters',28)}</span><span class="status-tag ${a.status==='Up'?'connected':''}">${a.status==='Up'?'<i></i>':''}${esc(a.status)}</span></div><h2>${esc(appName(a.name))}</h2><p>${esc(a.description)}</p><div class="adapter-speed"><strong>${esc(a.speed)}</strong><span>link speed</span></div><dl><div><dt>IPv4 address</dt><dd>${a.ipv4.map(esc).join('<br>')||'Not assigned'}</dd></div><div><dt>IPv6 address</dt><dd>${a.ipv6.map(esc).join('<br>')||'Not assigned'}</dd></div><div><dt>MAC address</dt><dd>${esc(a.mac)||'Not available'}</dd></div><div><dt>Gateway</dt><dd>${a.gateway.map(esc).join('<br>')||'Not assigned'}</dd></div><div><dt>DNS servers</dt><dd>${a.dns.map(esc).join('<br>')||'Not assigned'}</dd></div></dl><div class="adapter-counter"><span>${icon('down',15)} ${bytes(a.receivedBytes)} received</span><span>${icon('up',15)} ${bytes(a.sentBytes)} sent</span></div><div class="adapter-errors">${a.receivedErrors+a.sentErrors} packet errors reported by adapter</div></section>`).join('')||'<section class="panel empty-cell">Waiting for adapter information from the local collector.</section>'}</div><div class="plain-note">${icon('info',16)} Adapter byte counters are Windows’ cumulative counters, usually since the adapter last restarted. They are separate from the recent traffic chart.</div>`; }
function renderContent(){
  const fn={overview,connections:connectionsPage,activity:activityPage,secrets:secretsPage,adapters:adaptersPage}[state.page];
  const source=trafficSource(), main=$('#main');
  main.classList.toggle('traffic-overview',state.page==='overview');
  state.trafficView.update(state.snapshot,source);
  refreshNetworkControls();
  const markup=setupSlot('main')+fn();
  transportAnimator.detach();
  main.innerHTML=markup;
  if(state.page==='activity'&&!state.paused)queueMicrotask(()=>analyticsView.load(state.mode,()=>{if(state.page==='activity'&&!analyticsView.editing)renderContent();}));
  transportAnimator.mount(main,{source,active:state.motion&&!state.paused});
  document.body.classList.toggle('no-motion',!state.motion||state.paused);
}
function navigate(page){state.page=pages.some(p=>p[0]===page)?page:'overview';location.hash=state.page;shell();window.scrollTo({top:0});}
function drawer(title,body){ $('#overlay').innerHTML=`<div class="overlay-backdrop" data-action="close"></div><section class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="drawer-top"><span class="eyebrow">A CLOSER LOOK</span><button class="icon-button button" data-action="close" aria-label="Close panel">${icon('close',18)}</button></div><h2>${title}</h2>${body}</section>`; $('#overlay .drawer').querySelector('button')?.focus();document.body.classList.add('drawer-open'); }
function closeDrawer(){ $('#overlay').innerHTML='';state.detail=null;document.body.classList.remove('drawer-open');$('.sidebar [data-action="settings"]')?.focus();}
function inspect(id){ const c=connections().find(c=>c.id===id);if(!c){toast('That connection has departed. Try a current route.');return;}state.detail=c;drawer('Connection field notes',`<div class="detail-app">${appBadge(c.app)}<div><strong>${esc(appName(c.app))}</strong><span>PID ${c.pid}</span></div><span class="status-tag ${c.state==='Established'?'connected':''}">${esc(c.state)}</span></div><div class="detail-route">${appBadge(c.app)}<span>······· ${icon('arrow',22)} ·······</span>${brandBadge(serviceIdentity(c))}</div><dl class="detail-list">${[['Remote IP',c.remoteAddress],['Remote port',c.remotePort||'No remote endpoint'],['Local address',c.localAddress],['Local port',c.localPort],['Protocol',c.protocol],['Download',rate(c.receiveRate)],['Upload',rate(c.sendRate)],['Traffic source',c.trafficSource||'Connection table only'],['Network scope',c.scope],['First observed',new Date(c.firstSeen).toLocaleString()],['Snapshot',new Date(state.snapshot.timestamp).toLocaleString()]].map(([k,v])=>`<div><dt>${k}</dt><dd>${['Download','Upload'].includes(k)?v:esc(v)}</dd></div>`).join('')}</dl><h3>Hostname clues</h3><p class="drawer-copy">${c.domainCandidates?.length?c.domainCandidates.map(esc).join('<br>'):'No hostname match in the local DNS cache.'}</p><div class="notice">${icon('info',17)} A DNS cache match doesn’t prove this app requested that hostname. Connections are sampled; short-lived routes may be missed.</div><button class="dark-button full-width" data-watch="${esc(c.app)}">${icon('star',16)} ${state.watched.has(c.app)?'Remove from watchlist':'Watch this application'}</button>`);}
async function preferences(){const companion=await companionPreferences();drawer('Make yourself at home.',`<p class="drawer-copy">A few small things to make your observatory feel like yours.</p>${companion}<div class="preference-row"><div><strong>Little vehicles in motion</strong><p>Let bicycles, trucks, and jumbo jets take the scenic route.</p></div><button class="switch ${state.motion?'on':''}" data-action="motion" role="switch" aria-checked="${state.motion}" aria-label="Animate vehicles"><span></span></button></div><h3>Your watchlist</h3><p class="drawer-copy">${state.watched.size?`Watching ${[...state.watched].map(name=>esc(appName(name))).join(', ')}.`:'No applications on your watchlist yet. Add one from Little Secrets.'}</p>${state.watched.size?'<button class="button" data-action="clear-watch">Clear watchlist</button>':''}<div class="privacy-card">${icon('laptop',28)}<strong>Home is where your data stays.</strong><p>The collector runs on this computer. No accounts, remote telemetry, packet uploads, or external lookups. ${window.netKonnect?"The app uses local IPC and blocks outbound network requests. The installer adds a Windows Firewall outbound block. Preferences stay in the local app profile; the companion saves history to SQLite on this computer.":"Preferences stay in local browser storage; measured analytics history is saved locally for searches across restarts."}</p></div>`);}
function csvCell(s){let v=String(s??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
function exportCSV(){ const rows=[['Application','PID','Protocol','Local address','Local port','Remote address','Remote port','State','Scope','DNS cache candidates','First observed','Snapshot','Source'],...filtered().map(c=>[c.app,c.pid,c.protocol,c.localAddress,c.localPort,c.remoteAddress,c.remotePort,c.state,c.scope,c.domainCandidates?.join('; '),c.firstSeen,state.snapshot.timestamp,state.mode])]; const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`netkonnect-${state.mode}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`Exported ${rows.length-1} connection routes.`); }

let liveSnapshot=null;
async function poll(){
  if(state.restarting)return;
  await refreshSetupStatus();
  try { const response=await localRequest('/api/snapshot');if(!response.ok)throw new Error(`Local collector returned ${response.status}.`);const data=await response.json();state.service=data.service;liveSnapshot=data.snapshot;state.error=data.error||data.service?.storageError;state.collecting=data.collecting;if(!state.paused)state.snapshot=liveSnapshot; }
  catch(error){ if(state.mode==='live')state.error=window.netKonnect?'Can’t reach the tray companion. Relaunch netKonnect to reconnect.':'Can’t reach the local collector. Start the app server to reconnect.'; }
  refreshNetworkControls();
  if(!state.paused)state.trafficView.update(state.snapshot, trafficSource());
  if(state.page==='activity'){
    if(!state.paused&&!analyticsView.editing&&!document.querySelector('#analytics-form:focus-within, #global-search:focus'))analyticsView.load(state.mode,()=>{if(state.page==='activity'&&!analyticsView.editing)renderContent();});
  }else if(!state.paused && !document.querySelector('#global-search:focus, #table-search:focus, #map-search:focus, .transport-controls select:focus') && !$('.drawer'))renderContent();
}
async function restartService(){
  if(state.restarting || state.mode!=='live' || !state.service?.instanceId)return;
  const previousInstance=state.service.instanceId;
  state.restarting=true;
  closeDrawer();
  renderContent();
  try {
    const response=await localRequest('/api/restart',{method:'POST',headers:{'X-NetKonnect-Instance':previousInstance},signal:AbortSignal.timeout(10000)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error || 'Could not restart the service. Try again.');
    const deadline=Date.now()+90000;
    let replacement=null;
    while(Date.now()<deadline){
      try {
        const check=await localRequest('/api/snapshot',{cache:'no-store',signal:AbortSignal.timeout(3000)});
        if(check.ok){
          const data=await check.json();
          if(data.service?.instanceId && data.service.instanceId!==previousInstance){replacement=data;break;}
          if(data.service?.instanceId===previousInstance && !data.service.restarting && data.error)throw new Error(data.error);
        }
      } catch(error){
        if(error.message.startsWith('Could not restart the service:'))throw error;
        // The old process closes the connection while the replacement starts.
      }
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!replacement)throw new Error('The service has not reconnected yet. Wait a moment and try again.');
    state.service=replacement.service;
    liveSnapshot=replacement.snapshot;
    state.snapshot=liveSnapshot;
    state.error=replacement.error;
    state.collecting=replacement.collecting;
    state.paused=false;
    state.restarting=false;
    analyticsView.loadedAt=0;
    toast('Service restarted. Saved analytics history is preserved.');
  } catch(error){
    state.restarting=false;
    toast(error.message || 'Could not restart the service. Try again.');
  }
  renderContent();
  poll();
}

function refreshAnalytics(){analyticsView.load(state.mode,()=>{if(state.page==='activity')renderContent();},{force:true});renderContent();}
function handleAnalyticsClick(e){
  const target=e.target.closest('[data-analytics-action],[data-analytics-range],[data-analytics-app],[data-analytics-service],[data-analytics-weekday],[data-analytics-hour]');
  if(!target)return false;
  const d=target.dataset;
  if(d.analyticsRange){analyticsView.preset(d.analyticsRange);refreshAnalytics();return true;}
  if(d.analyticsApp||d.analyticsService){analyticsView.drillInto(d.analyticsApp?'app':'service',d.analyticsApp||d.analyticsService,d.analyticsLabel);refreshAnalytics();window.scrollTo({top:0,behavior:'smooth'});return true;}
  if(d.analyticsWeekday!==undefined||d.analyticsHour!==undefined){analyticsView.filters={...analyticsView.filters,...(d.analyticsWeekday!==undefined?{weekday:d.analyticsWeekday}:{}),...(d.analyticsHour!==undefined?{hour:d.analyticsHour}:{}),min:'',max:''};analyticsView.offset=0;analyticsView.result=null;refreshAnalytics();return true;}
  const action=d.analyticsAction;
  if(action==='export'){analyticsView.export(state.mode);return true;}
  if(action==='reset')analyticsView.reset();
  if(action==='back')analyticsView.back();
  if(action==='example'){analyticsView.reset();analyticsView.filtersOpen=true;analyticsView.filters={...analyticsView.filters,range:'all',query:'firefox',weekday:'2',month:'10',min:'1',unit:'GB',bucket:'day'};}
  if(action==='next')analyticsView.offset+=50;
  if(action==='previous')analyticsView.offset=Math.max(0,analyticsView.offset-50);
  refreshAnalytics();return true;
}
document.addEventListener('click',e=>{
  const speed = e.target.closest('[data-action="speed-unit"]');
  if(speed){
    e.preventDefault();
    const speeds = [...document.querySelectorAll('.speed-value')], index = speeds.indexOf(speed);
    rateUnit=nextSpeedUnit(rateUnit);persist();renderContent();
    if(state.detail?.connections)drawer('Route details',routeDetails(state.detail,{esc,rate,bytes,icon},state.snapshot));
    else if(state.detail)inspect(state.detail.id);
    document.querySelectorAll('.speed-value')[index]?.focus({preventScroll:true});
    toast(`Traffic speeds shown in ${rateUnit}. Click any speed to change units.`);
    return;
  }
  if(handleCompanionAction(e,()=> { if($('.drawer')&&!state.detail)preferences(); renderContent(); },toast))return;
  if(handleAnalyticsClick(e))return;
  const expand=e.target.closest('[data-map-expand]')?.dataset.mapExpand;
  if(expand){if(state.mapExpanded.has(expand))state.mapExpanded.delete(expand);else state.mapExpanded.add(expand);renderContent();[...document.querySelectorAll('[data-map-expand]')].find(button=>button.dataset.mapExpand===expand)?.focus();return;}
  const routeKey=e.target.closest('[data-route]')?.dataset.route;
  if(routeKey){const route=buildRoutes(connections(),{detail:state.mapDetail,usageConnections:state.snapshot?.traffic?.usageConnections || []}).find(r=>r.key===routeKey);if(route){state.detail=route;drawer('Route details',routeDetails(route,{esc,rate,bytes,icon},state.snapshot));}return;}
  const sort=e.target.closest('[data-map-sort]')?.dataset.mapSort;
  if(sort){state.mapSortDirection=state.mapSort===sort?(state.mapSortDirection==='desc'?'asc':'desc'):['app','service'].includes(sort)?'asc':'desc';state.mapSort=sort;persist();renderContent();return;}
  const page=e.target.closest('[data-page]');if(page){closeDrawer();navigate(page.dataset.page);return;}
  const app=e.target.closest('[data-app]');if(app){state.secretApp=app.dataset.app;navigate('secrets');return;}
  const suspect=e.target.closest('[data-suspect]');if(suspect){state.secretApp=suspect.dataset.suspect;renderContent();return;}
  const scope=e.target.closest('[data-scope]');if(scope){state.scope=scope.dataset.scope;renderContent();return;}
  const connection=e.target.closest('[data-connection]');if(connection){inspect(connection.dataset.connection);return;}
  const watch=e.target.closest('[data-watch]');if(watch){const name=watch.dataset.watch;if(state.watched.has(name))state.watched.delete(name);else state.watched.add(name);persist();toast(state.watched.has(name)?`${name} is on your watchlist.`:`${name} removed from your watchlist.`);if(state.detail)inspect(state.detail.id);else renderContent();return;}
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='restart-service'){restartService();return;}
  if(action==='close')closeDrawer();
  if(action==='more-routes'){state.mapLimit+=10;renderContent();}
  if(action==='export')exportCSV();
  if(action==='settings')preferences();
  if(action==='clear-watch'){state.watched.clear();persist();preferences();renderContent();}
  if(action==='motion'){state.motion=!state.motion;persist();renderContent();if($('.drawer')&&!state.detail)preferences();}
  if(action==='pause'){state.paused=!state.paused;renderContent();if($('.drawer')&&!state.detail)preferences();toast(state.paused?'Display paused. The local collector continues observing.':'Display updates resumed.');if(!state.paused)poll();}
});
document.addEventListener('input',e=>{if(e.target.id==='map-search'){const pos=e.target.selectionStart;state.mapQuery=e.target.value;state.mapLimit=10;renderContent();$('#map-search')?.focus();$('#map-search')?.setSelectionRange(pos,pos);return;}if(['global-search','table-search'].includes(e.target.id)){if(state.page==='activity'){const form=$('#analytics-form');form.elements.query.value=e.target.value;analyticsView.editing=true;return;}const id=e.target.id,pos=e.target.selectionStart;state.query=e.target.value;if(state.page!=='connections'){state.page='connections';location.hash='connections';shell();}else renderContent();const input=$('#'+id);input?.focus();input?.setSelectionRange(pos,pos);}});
document.addEventListener('change',e=>{const mapFields={'map-app':'mapApp','map-detail':'mapDetail','map-vehicle':'mapVehicle','map-sort':'mapSort'};if(mapFields[e.target.id]){state[mapFields[e.target.id]]=e.target.value;if(e.target.id==='map-sort'){state.mapSortDirection=['app','service'].includes(state.mapSort)?'asc':'desc';persist();}state.mapLimit=10;renderContent();}if(e.target.id==='protocol-filter'){state.protocol=e.target.value;renderContent();}if(e.target.id==='range-filter'){state.range=Number(e.target.value);renderContent();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#global-search').focus();}if(['Enter',' '].includes(e.key)&&e.target.matches('.destination')){e.preventDefault();state.secretApp=e.target.dataset.app;navigate('secrets');}if(e.key==='Tab'&&$('.drawer')){const items=[...$('.drawer').querySelectorAll('button,a,input,select,[tabindex="0"]')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(p!==state.page)navigate(p);});
state.page=pages.some(p=>p[0]===location.hash.slice(1))?location.hash.slice(1):'overview';
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches && prefs.motion===undefined)state.motion=false;
document.addEventListener('submit',e=>{if(e.target.id!=='analytics-form')return;e.preventDefault();if(!e.target.reportValidity())return;analyticsView.apply(e.target);refreshAnalytics();});
document.addEventListener('input',e=>{if(e.target.closest('#analytics-form'))analyticsView.editing=true;});
document.addEventListener('change',e=>{if(e.target.closest('#analytics-form'))analyticsView.editing=true;});
document.addEventListener('toggle',e=>{if(e.target.matches('.analytics-filters'))analyticsView.filtersOpen=e.target.open;},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='global-search'&&state.page==='activity'){e.preventDefault();$('#analytics-form').requestSubmit();}});
shell();poll();setInterval(poll,2000);

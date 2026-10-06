import { appIdentity, appName, brandBadge } from './brands.js';
import { buildRoutes, groupApplicationRoutes, transportForRate, JourneyQueue } from './routes.js';
import { renderCity, cityStage, worker } from './cities.js';

function wheel(x, y, bicycle = false) {
  const r = bicycle ? 6 : 2.4;
  return `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${bicycle?'#fff':'#263344'}" stroke="${bicycle?'currentColor':'#263344'}" stroke-width="${bicycle?1.1:.3}"/><g class="wheel-spokes ${bicycle?'bicycle-spokes':''}" style="animation-delay:-${(Date.now()%650)/1000}s"><path d="${bicycle?'M-5 0h10M0-5v10M-3.5-3.5l7 7M-3.5 3.5l7-7':'M-1.5 0h3M0-1.5v3'}" stroke="${bicycle?'currentColor':'#d2dae3'}" stroke-width="${bicycle?.55:.7}"/></g><circle r=".8" fill="currentColor"/></g>`;
}
export function vehicle(type, incoming = false) {
  if (type === 'plane') return `<g class="supply-plane" fill="#e9f3f7" stroke="#385065" stroke-width="1.1" stroke-linejoin="round"><path d="M-26-3h36q14 0 19 5-5 5-19 5h-36z"/><path d="M-5-3-16-17h8L9-3M-5 7-16 19h8L9 7" fill="#d2e6ab"/><path d="M-20-3-25-12h5l10 9" fill="#edaa8b"/><path d="M16-2h5l4 4h-9z" fill="#b4d8e8"/><path class="plane-propeller" d="M29-6v16"/><path d="M-14 2h18" stroke-dasharray="2 4"/></g>`;
  if (type === 'bicycle') return `<g class="supply-pushcart" stroke="#385065" stroke-width="1.1" stroke-linejoin="round"><g transform="translate(-17 9)">${worker({woman:incoming,color:incoming?'#83c1d3':'#eaa88e'})}</g><path d="M-12 1h9M-4-1h23v8H-4z" fill="#dfbc85"/><path d="M-2-7h20v4H-2zM-4-3h24v4H-4z" fill="#eccf9a"/>${wheel(4,9)}${wheel(16,9)}</g>`;
  return `<g class="supply-pickup" stroke="#385065" stroke-width="1.1" stroke-linejoin="round"><path d="M-20-3H2v-9h12l8 9v10h-42z" fill="${incoming?'#a4d0e7':'#afd5bc'}"/><path d="M5-10h8l6 7H5z" fill="#f4fbff"/><path d="M-18-11h9v8h-9zM-8-13h8v10h-8z" fill="#e6ba72"/><path d="M-17-10-10-4M-10-10-17-4M-7-12-1-4M-1-12-7-4"/><path d="M-20 7h42M4 0h4"/>${wheel(-12,8)}${wheel(15,8)}</g>`;
}
const SVG_NS = 'http://www.w3.org/2000/svg';

export class TransportAnimator {
  constructor({clock=()=>performance.now(), requestFrame=callback=>requestAnimationFrame(callback), cancelFrame=id=>cancelAnimationFrame(id)} = {}) {
    this.clock = clock; this.requestFrame = requestFrame; this.cancelFrame = cancelFrame;
    this.queue = new JourneyQueue(); this.svgs = new Map(); this.cities = new Map(); this.source = null;
    this.lastTime = this.clock(); this.active = false; this.frame = null;
  }
  tick() {
    const now = this.clock();
    this.queue.advance(this.active ? now-this.lastTime : 0, this.active);
    this.lastTime = now;
  }
  // Keep the actual SVGs and vehicle nodes out of the part of the page whose
  // innerHTML gets replaced. Reattach those same nodes after updating the labels.
  detach() { for (const svg of [...this.svgs.values(),...this.cities.values()]) svg.remove(); }
  mount(root,{source,active}) {
    this.tick();
    if (source !== this.source) { this.queue = new JourneyQueue(); this.svgs.clear(); this.cities.clear(); this.source = source; }
    this.active = active;
    const cities=new Map();
    for(const placeholder of root.querySelectorAll('.service-city')) {
      const key=placeholder.dataset.cityKey,retained=this.cities.get(key);
      const svg=retained?.dataset.stage===placeholder.dataset.stage?retained:placeholder;
      if(svg!==placeholder) {
        svg.setAttribute('class',placeholder.getAttribute('class'));
        svg.setAttribute('aria-label',placeholder.getAttribute('aria-label'));
        svg.dataset.progress=placeholder.dataset.progress;
        placeholder.replaceWith(svg);
      } else if(retained)svg.classList.add('city-new-stage');
      cities.set(key,svg);
    }
    this.cities=cities;
    const configurations = [], visible = new Map();
    for (const placeholder of root.querySelectorAll('.convoy-svg')) {
      const key = placeholder.dataset.routeKey;
      const retained = this.svgs.get(key);
      const svg = retained || placeholder;
      if (retained) {
        svg.setAttribute('aria-label',placeholder.getAttribute('aria-label'));
        for (const name of ['downloadRate','uploadRate','downloadType','uploadType']) svg.dataset[name] = placeholder.dataset[name];
        placeholder.replaceWith(svg);
      }
      for (const [direction,incoming] of [['download',true],['upload',false]]) {
        configurations.push({key:`${key}|${direction}`, incoming,
          rate:placeholder.dataset[`${direction}Rate`] === '' ? null : Number(placeholder.dataset[`${direction}Rate`]),
          type:placeholder.dataset[`${direction}Type`]});
      }
      visible.set(key,svg);
    }
    this.svgs = visible;
    this.queue.configure(configurations);
    this.queue.advance(0,this.active || (this.queue.serial === 0 && this.queue.now === 0));
    this.draw();
    if (this.frame !== null) { this.cancelFrame(this.frame); this.frame = null; }
    if (this.active && this.svgs.size) this.schedule();
  }
  schedule() {
    this.frame = this.requestFrame(()=>{
      this.frame = null;
      this.tick(); this.draw();
      if (this.active && this.svgs.size) this.schedule();
    });
  }
  draw() {
    for (const [key,svg] of this.svgs) {
      const journeys = ['download','upload'].flatMap(direction=>this.queue.lanes.get(`${key}|${direction}`)?.vehicles || []);
      const existing = new Map([...svg.querySelectorAll('.transport-vehicle')].map(g=>[Number(g.dataset.journeyId),g]));
      for (const journey of journeys) {
        let group = existing.get(journey.id);
        if (!group) {
          group = svg.ownerDocument.createElementNS(SVG_NS,'g');
          group.setAttribute('class',`transport-vehicle ${journey.incoming?'incoming-fleet':'outgoing-fleet'}`);
          group.dataset.journeyId = journey.id;
          group.dataset.transport = journey.type;
          const scale = journey.type === 'plane' ? .72 : .85;
          group.innerHTML = `<g transform="scale(${journey.incoming?-scale:scale} ${scale})">${vehicle(journey.type,journey.incoming)}</g>`;
          svg.append(group);
        }
        existing.delete(journey.id);
        const progress = this.queue.progress(journey);
        const x = journey.incoming ? 566-532*progress : 34+532*progress;
        group.dataset.progress = progress.toFixed(6);
        group.setAttribute('transform',`translate(${x.toFixed(3)} ${journey.incoming?19:51})`);
      }
      for (const group of existing.values()) group.remove();
      const idle = svg.parentElement.querySelector('.road-idle');
      if (idle) idle.hidden = journeys.length > 0;
    }
  }
}


export function renderNetworkMap({state,icon,rate,bytes,esc}) {
  const filters = {app:state.mapApp, query:state.mapQuery, detail:state.mapDetail, usageConnections:state.snapshot?.traffic?.usageConnections || [], cityUsage:state.snapshot?.traffic?.cityUsage || [], sort:state.mapSort, direction:state.mapSortDirection};
  const routes = buildRoutes(state.snapshot?.connections || [],filters);
  const apps = [...new Set([...(state.snapshot?.connections||[]), ...(state.snapshot?.traffic?.usageConnections||[])].filter(c=>c.scope==='Internet'&&c.pid!==0).map(c=>c.app))].sort((a,b)=>appName(a).localeCompare(appName(b)));
  const groups = groupApplicationRoutes(routes,{sort:state.mapSort,direction:state.mapSortDirection});
  const visible = groups.slice(0,state.mapLimit);
  state.mapExpanded ??= new Set();
  state.mapSeenApps ??= new Set(state.mapCitiesInitialized?groups.map(g=>g.key):[]);
  for(const group of visible)if(!state.mapSeenApps.has(group.key)) {
    state.mapExpanded.add(group.key);state.mapSeenApps.add(group.key);
  }
  if(visible.length)state.mapCitiesInitialized=true;
  const active = state.motion && !state.paused && !state.reducedMotion;
  const traffic = state.snapshot?.traffic;
  const sorts = [['total','Total · 60 min'],['download','Download · 60 min'],['upload','Upload · 60 min'],['app','Application'],['service','Service / destination'],['connections','Connections']];
  const sortHeader = (key,label) => `<span role="columnheader" aria-sort="${state.mapSort===key?(state.mapSortDirection==='asc'?'ascending':'descending'):'none'}"><button class="route-sort ${state.mapSort===key?'selected':''}" data-map-sort="${key}" title="Sort by ${label}; click again to reverse">${label}<span aria-hidden="true">${state.mapSort===key?(state.mapSortDirection==='asc'?'↑':'↓'):'↕'}</span></button></span>`;
  const coverage = traffic?.usageStartedAt && Date.now()-Date.parse(traffic.usageStartedAt)<3600000 ? ` · collecting since ${new Date(traffic.usageStartedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : '';
  const renderRoute = (r,parent=false) => {
    const lane = direction => {
      if (!parent) return state.trafficView?.lane(r,state.mapDetail,direction) || {rate:r.measured?r[direction]:null,type:transportForRate(r[direction])};
      const rate = r.measured ? r.routes.reduce((sum,child)=>sum + (state.trafficView?.lane(child,state.mapDetail,direction).rate ?? child[direction]),0) : null;
      return {rate,type:transportForRate(rate,state.trafficView?.lane(r,'application',direction).type)};
    };
    const download = lane('receiveRate'), upload = lane('sendRate');
    const downloadType = state.mapVehicle==='auto' ? download.type : state.mapVehicle;
    const uploadType = state.mapVehicle==='auto' ? upload.type : state.mapVehicle;
    const protocols = [...r.protocols].join(' + ');
    const cityBytes=r.cityBytes ?? null, stage=cityStage(cityBytes);
    const city=parent?'':`<div class="route-city" role="cell">${renderCity({key:esc(state.mapDetail+'|'+r.key),bytes:cityBytes,busy:r.measured&&(r.receiveRate>0||r.sendRate>0),airdrop:downloadType==='plane'||uploadType==='plane'})}<div class="city-caption"><strong>${stage.name}</strong><span>${bytes(cityBytes)} total recorded</span></div></div>`;
    const expanded = parent && state.mapExpanded?.has(r.key);
    const childrenId = 'app-routes-' + encodeURIComponent(r.key);
    const count = parent ? `${r.routes.length} ${state.mapDetail==='endpoint'?'endpoint':'service'}${r.routes.length===1?'':'s'}` : '';
    const endpoint = !parent && state.mapDetail==='endpoint' ? `${r.endpoint.remoteAddress}:${r.endpoint.remotePort}` : `${r.addresses.size} IP${r.addresses.size===1?'':'s'} · ${r.connections.length} active connection${r.connections.length===1?'':'s'}`;
    return `<article class="transport-route ${parent?'application-parent':'application-child service-city-card'}" role="row"><div role="cell">${parent?`<button class="route-origin" data-app="${esc(r.app)}">${brandBadge(appIdentity(r.app),'origin-mark')}<strong>${esc(appName(r.app))}</strong><small>PID ${[...r.pids].join(', ')} · ${protocols}</small></button>`:`<div class="route-child-origin"><strong>${protocols}${protocols==='UDP'&&r.connections.some(c=>c.remotePort===443)?' / possible QUIC':''}</strong><small>PID ${[...r.pids].join(', ')}</small></div>`}</div><div class="route-road" role="cell"><div class="route-speeds" title="Smooth average · approximately 10 seconds"><span class="download-rate">↓ ${rate(download.rate)}</span><span class="upload-rate">↑ ${rate(upload.rate)}</span></div><svg class="convoy-svg" data-route-key="${esc((parent?'application':state.mapDetail)+'|'+r.key)}" data-download-rate="${r.measured?download.rate:''}" data-upload-rate="${r.measured?upload.rate:''}" data-download-type="${downloadType}" data-upload-type="${uploadType}" viewBox="0 0 600 76" role="img" aria-label="${esc(appName(r.app))} to ${esc(parent?'all associated destinations':r.service.label)}: ${r.measured?`${Math.round(download.rate)} bytes per second average download, ${Math.round(upload.rate)} average upload`:'route bandwidth unavailable'}"><path d="M20 19h560" class="road incoming-road"/><path d="M20 51h560" class="road outgoing-road"/><path d="M20 35h560" class="road-divider"/></svg>${r.measured && !download.rate && !upload.rate?`<span class="road-idle">${r.connections.length?'Idle':'No active connections'}</span>`:!r.measured?'<span class="road-idle">Awaiting byte-level capture</span>':''}</div><div role="cell">${parent?`<button class="route-terminal route-expand" data-map-expand="${esc(r.key)}" aria-expanded="${expanded?'true':'false'}" aria-controls="${esc(childrenId)}" aria-label="${expanded?'Hide':'Show'} ${count} for ${esc(appName(r.app))}"><span><strong>${count}${state.mapDetail==='service'?' & destinations':''}</strong><small>${r.addresses.size} IP${r.addresses.size===1?'':'s'} · ${r.connections.length} active connection${r.connections.length===1?'':'s'}</small><em>${expanded?'Hide':'Show'} ${state.mapDetail==='endpoint'?'endpoints':'services'}</em></span>${icon('chevron',14)}</button>`:`<button class="route-terminal" data-route="${esc(r.key)}">${brandBadge(r.service,'terminal-icon')}<span><strong>${esc(r.service.label)}</strong><small>${esc(endpoint)}</small><em>${r.service.confidence}</em></span>${icon('chevron',14)}</button>`}</div>${city}<span role="cell" class="route-usage route-total"><small class="usage-label">Total · 60 min</small>${bytes(r.totalBytes60m)}</span><span role="cell" class="route-usage download-rate"><small class="usage-label">Download · 60 min</small>${bytes(r.receivedBytes60m)}</span><span role="cell" class="route-usage upload-rate"><small class="usage-label">Upload · 60 min</small>${bytes(r.sentBytes60m)}</span></article>`;

  };
  return `<section class="panel dispatch-panel"><div class="transport-toolbar"><h2>Service cities</h2><div class="transport-controls"><label>Application<select id="map-app"><option value="all">All applications</option>${apps.map(a=>`<option value="${esc(a)}" ${state.mapApp===a?'selected':''}>${esc(appName(a))}</option>`).join('')}</select></label><label>Detail<select id="map-detail"><option value="service" ${state.mapDetail==='service'?'selected':''}>App → service</option><option value="endpoint" ${state.mapDetail==='endpoint'?'selected':''}>App → IP / port</option></select></label><label>Transport<select id="map-vehicle">${[['auto','Automatic'],['bicycle','Wood pushcarts'],['truck','Supply pickups'],['plane','Airdrops']].map(([v,l])=>`<option value="${v}" ${state.mapVehicle===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Sort by<select id="map-sort">${sorts.map(([v,l])=>`<option value="${v}" ${state.mapSort===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="button sort-direction" data-map-sort="${state.mapSort}" aria-label="${state.mapSortDirection==='asc'?'Ascending':'Descending'} order; reverse sort direction" title="${state.mapSortDirection==='asc'?'Ascending':'Descending'} order; reverse sort direction">${state.mapSortDirection==='asc'?'↑':'↓'}</button><label class="route-search">Destination<input id="map-search" value="${esc(state.mapQuery)}" placeholder="YouTube, Firefox, IP…" type="search"></label><button class="button icon-button" data-action="motion" aria-label="${state.motion?'Pause':'Animate'} supplies and construction">${icon(state.motion?'pause':'play',16)}</button></div></div>${!traffic?.available&&state.mode==='live'?`<div class="capture-status">${icon('info',16)}<span>${esc(traffic?.message||'Waiting for network collection…')}<small>Adapter speeds are visible above. Convoys appear when per-route byte measurements are available.</small></span></div>`:''}${traffic?.eventsLost?`<div class="capture-status">${icon('info',16)} Windows dropped ${traffic.eventsLost} trace events; displayed route rates may undercount traffic.</div>`:''}<div class="transport-table" role="table" aria-label="Service cities and traffic; usage columns cover the last 60 minutes"><div class="transport-header" role="row">${sortHeader('app','Application')}<span role="columnheader"><i class="direction-dot incoming-dot"></i> DOWNLOAD ← <i class="direction-dot outgoing-dot"></i> UPLOAD →</span>${sortHeader('service','Service / destination')}${sortHeader('total','Total · 60m')}${sortHeader('download','Download · 60m')}${sortHeader('upload','Upload · 60m')}</div><div class="transport-routes ${active?'':'still'}" role="rowgroup">${visible.map(group=>`<div class="application-group">${renderRoute(group,true)}<div id="${esc('app-routes-'+encodeURIComponent(group.key))}" class="application-children" role="rowgroup" aria-label="${esc(appName(group.app))} associated destinations" ${state.mapExpanded?.has(group.key)?'':'hidden'}>${state.mapExpanded?.has(group.key)?group.routes.map(r=>renderRoute(r)).join(''):''}</div></div>`).join('')||`<div class="empty-cell">${state.snapshot?'No routes match this view.':'Waiting for your network…'}</div>`}</div></div><div class="transport-foot"><button class="text-button" data-page="connections">Inspect connections ${icon('arrow',16)}</button><span>${groups.length} application${groups.length===1?'':'s'} · ${routes.length} ${state.mapDetail==='endpoint'?'endpoint':'service'}${routes.length===1?'':'s'}${groups.length>visible.length?` · showing ${visible.length} application${visible.length===1?'':'s'}`:''} · city size: total recorded data · usage columns: last 60 minutes${coverage}.</span>${groups.length>visible.length?'<button class="text-button" data-action="more-routes">Show more applications ↓</button>':''}<span>${state.mode==='demo'?'Illustrative traffic':traffic?.available?'10-second smooth average · sampled every 2 seconds':'Speeds unavailable'}</span></div></section>`;
}
export function routeDetails(route,{esc,rate,bytes,icon},snapshot) {
  return `<div class="route-detail-heading">${brandBadge(appIdentity(route.app))}<strong>${esc(appName(route.app))} ↔ ${esc(route.service.label)}</strong>${brandBadge(route.service)}</div><div class="route-detail-rates"><span>Download<strong>${rate(route.measured?route.receiveRate:null)}</strong></span><span>Upload<strong>${rate(route.measured?route.sendRate:null)}</strong></span></div><div class="route-detail-usage"><span>Total · 60 min<strong>${bytes(route.totalBytes60m)}</strong></span><span>Download · 60 min<strong>${bytes(route.receivedBytes60m)}</strong></span><span>Upload · 60 min<strong>${bytes(route.sentBytes60m)}</strong></span></div><p class="drawer-copy">${esc(route.service.hint)}. Service labels use DNS cache clues; they identify a possible service, not a physical headquarters or the contents of encrypted traffic.</p><h3>${route.connections.length} connections · ${route.addresses.size} destinations</h3><div class="route-endpoints">${route.connections.map(c=>`<div class="route-endpoint"><button data-connection="${esc(c.id)}"><span><strong>${esc(c.remoteAddress)}:${c.remotePort}</strong><small>${esc(c.protocol)} · PID ${c.pid} · ${esc(c.state)}</small><small>${(c.domainCandidates||[]).map(esc).join(', ')||'No cached hostname'}</small></span>${icon('chevron',14)}</button><span>↓ ${rate(c.receiveRate)}<br>↑ ${rate(c.sendRate)}</span></div>`).join('')||'<p class="drawer-copy">No active connections. Usage from completed transfers remains here until it leaves the 60-minute window.</p>'}</div><p class="drawer-copy">${snapshot?.traffic?.timestamp?`Measured ${esc(new Date(snapshot.traffic.timestamp).toLocaleTimeString())}.`:''} UDP peers come from observed network events, including UDP/443 used by QUIC.</p>`;
}

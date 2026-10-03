import { buildRoutes, transportForRate, JourneyQueue } from './routes.js';

function wheel(x, y, bicycle = false) {
  const r = bicycle ? 6 : 2.4;
  return `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${bicycle?'#fff':'#263344'}" stroke="${bicycle?'currentColor':'#263344'}" stroke-width="${bicycle?1.1:.3}"/><g class="wheel-spokes ${bicycle?'bicycle-spokes':''}" style="animation-delay:-${(Date.now()%650)/1000}s"><path d="${bicycle?'M-5 0h10M0-5v10M-3.5-3.5l7 7M-3.5 3.5l7-7':'M-1.5 0h3M0-1.5v3'}" stroke="${bicycle?'currentColor':'#d2dae3'}" stroke-width="${bicycle?.55:.7}"/></g><circle r=".8" fill="currentColor"/></g>`;
}
export function vehicle(type, incoming = false) {
  if (type === 'plane') return `<g class="jumbo-jet"><g class="byte-contrail" aria-hidden="true" fill="currentColor" font-family="Consolas,monospace" font-size="9">${['1','0','1 B','0101','0x2A'].map((bit,i)=>`<text transform="translate(${-36-i*17} ${i%2?4:-3}) scale(${incoming?-1:1} 1)" text-anchor="middle" opacity="${.85-i*.13}">${bit}</text>`).join('')}</g><g fill="currentColor"><path d="M-17-2-25-10h6l9 7v6l-9 7h-6l8-8z"/><path d="M5-3-9-16h-7l8 14v4l-8 14h7L5 3z"/><g class="jet-engines">${[-1,1].flatMap(sign=>[8,13].map((y,i)=>`<rect x="${-6-i*6}" y="${sign*y-1.5}" width="6" height="3" rx="1.4"/>`)).join('')}</g><path class="jet-fuselage" d="M-26-1.5-10-3.5H16Q24-3.5 29 0Q24 3.5 16 3.5H-10L-26 1.5z"/><path d="M6-1.5H19Q23-1.5 25 0H6z" fill="#e9eff5" opacity=".8"/><path d="M21-1.7l2 .8m-2 2.6 2-.8" stroke="#263344" stroke-width=".8"/><path d="M-26 0h9" stroke="#e9eff5" stroke-width=".8"/></g></g>`;
  if (type === 'bicycle') return `<g class="bicycle">${wheel(-11,5,true)}${wheel(11,5,true)}<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M-11 5-5-6 1 5H-11L5-6H-5M1 5 5-6 11 5M5-6l-1-4h4M-5-6l-1-3m-3 0h6"/><path d="M-1-13-5-9 1-5-1 3M-1-13l5 3 3 .5"/></g><circle cx="0" cy="-17" r="2.2" fill="currentColor"/><path d="M-1-13-5-9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></g>`;
  return `<g><rect x="-13" y="-7" width="17" height="11" rx="1.6" fill="currentColor"/><path d="M5-4h5l5 5v3H5z" fill="currentColor"/><path d="M7-3h3l3 4H7z" fill="#e9eff5"/><path d="M-11-5H1" stroke="#fff" opacity=".35" stroke-width=".6"/><path d="M-13 4h28" stroke="#263344" stroke-width=".8"/>${wheel(-8,5)}${wheel(10,5)}</g>`;
}
const SVG_NS = 'http://www.w3.org/2000/svg';

export class TransportAnimator {
  constructor({clock=()=>performance.now(), requestFrame=callback=>requestAnimationFrame(callback), cancelFrame=id=>cancelAnimationFrame(id)} = {}) {
    this.clock = clock; this.requestFrame = requestFrame; this.cancelFrame = cancelFrame;
    this.queue = new JourneyQueue(); this.svgs = new Map(); this.source = null;
    this.lastTime = this.clock(); this.active = false; this.frame = null;
  }
  tick() {
    const now = this.clock();
    this.queue.advance(this.active ? now-this.lastTime : 0, this.active);
    this.lastTime = now;
  }
  // Keep the actual SVGs and vehicle nodes out of the part of the page whose
  // innerHTML gets replaced. Reattach those same nodes after updating the labels.
  detach() { for (const svg of this.svgs.values()) svg.remove(); }
  mount(root,{source,active}) {
    this.tick();
    if (source !== this.source) { this.queue = new JourneyQueue(); this.svgs.clear(); this.source = source; }
    this.active = active;
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

const terminal = `<svg viewBox="0 0 38 38" class="terminal-icon" aria-hidden="true"><path d="M5 31V14h28v17M10 14V8h18v6M3 32h32M10 20h4m6 0h4m5 0h1M10 25h4m6 0h4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M17 31v-5h5v5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;

export function renderNetworkMap({state,icon,rate,bytes,esc}) {
  const filters = {app:state.mapApp, query:state.mapQuery, detail:state.mapDetail, usageConnections:state.snapshot?.traffic?.usageConnections || [], sort:state.mapSort, direction:state.mapSortDirection};
  const routes = buildRoutes(state.snapshot?.connections || [],filters);
  const apps = [...new Set([...(state.snapshot?.connections||[]), ...(state.snapshot?.traffic?.usageConnections||[])].filter(c=>c.scope==='Internet'&&c.pid!==0).map(c=>c.app))].sort();
  const visible = routes.slice(0,state.mapLimit);
  const active = state.motion && !state.paused;
  const traffic = state.snapshot?.traffic;
  const sorts = [['total','Total · 60 min'],['download','Download · 60 min'],['upload','Upload · 60 min'],['app','Application'],['service','Service / destination'],['connections','Connections']];
  const sortHeader = (key,label) => `<span role="columnheader" aria-sort="${state.mapSort===key?(state.mapSortDirection==='asc'?'ascending':'descending'):'none'}"><button class="route-sort ${state.mapSort===key?'selected':''}" data-map-sort="${key}" title="Sort by ${label}; click again to reverse">${label}<span aria-hidden="true">${state.mapSort===key?(state.mapSortDirection==='asc'?'↑':'↓'):'↕'}</span></button></span>`;
  const coverage = traffic?.usageStartedAt && Date.now()-Date.parse(traffic.usageStartedAt)<3600000 ? ` · collecting since ${new Date(traffic.usageStartedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : '';
  return `<section class="panel dispatch-panel"><div class="panel-head"><div><h2>Live transport <span class="outline-tag">${state.mode==='demo'?'SAMPLE':traffic?.available?'BYTE-LEVEL CAPTURE':'CONNECTION VIEW'}</span></h2><p>Last 60 minutes of service usage, with smoothly averaged traffic in both directions.</p></div><button class="text-button" data-page="connections">Inspect connections ${icon('arrow',16)}</button></div><div class="transport-controls"><label>Application<select id="map-app"><option value="all">All applications</option>${apps.map(a=>`<option value="${esc(a)}" ${state.mapApp===a?'selected':''}>${esc(a)}</option>`).join('')}</select></label><label>Detail<select id="map-detail"><option value="service" ${state.mapDetail==='service'?'selected':''}>App → service</option><option value="endpoint" ${state.mapDetail==='endpoint'?'selected':''}>App → IP / port</option></select></label><label>Transport<select id="map-vehicle">${[['auto','Automatic'],['bicycle','Bicycles'],['truck','Trucks'],['plane','Jumbo jets']].map(([v,l])=>`<option value="${v}" ${state.mapVehicle===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Sort by<select id="map-sort">${sorts.map(([v,l])=>`<option value="${v}" ${state.mapSort===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="button sort-direction" data-map-sort="${state.mapSort}" aria-label="Reverse sort direction" title="Reverse sort direction">${state.mapSortDirection==='asc'?'↑ Ascending':'↓ Descending'}</button><label class="route-search">Destination<input id="map-search" value="${esc(state.mapQuery)}" placeholder="YouTube, Firefox, IP…" type="search"></label><button class="button icon-button" data-action="motion" aria-label="${state.motion?'Pause':'Animate'} vehicles">${icon(state.motion?'pause':'play',16)}</button></div>${!traffic?.available&&state.mode==='live'?`<div class="capture-status">${icon('info',16)}<span>${esc(traffic?.message||'Waiting for network collection…')}<small>Adapter speeds are visible above. Convoys appear when per-route byte measurements are available.</small></span></div>`:''}${traffic?.eventsLost?`<div class="capture-status">${icon('info',16)} Windows dropped ${traffic.eventsLost} trace events; displayed route rates may undercount traffic.</div>`:''}<div class="transport-table" role="table" aria-label="Service traffic and usage over the last 60 minutes"><div class="transport-header" role="row">${sortHeader('app','Application')}<span role="columnheader"><i class="direction-dot incoming-dot"></i> DOWNLOAD ← <i class="direction-dot outgoing-dot"></i> UPLOAD →</span>${sortHeader('service','Service / destination')}${sortHeader('total','Total · 60 min')}${sortHeader('download','Download · 60 min')}${sortHeader('upload','Upload · 60 min')}</div><div class="transport-routes ${active?'':'still'}" role="rowgroup">${visible.map(r=>{
    const lane = direction => state.trafficView?.lane(r,state.mapDetail,direction) || {rate:r.measured?r[direction]:null,type:transportForRate(r[direction])};
    const download = lane('receiveRate'), upload = lane('sendRate');
    const downloadType = state.mapVehicle==='auto' ? download.type : state.mapVehicle;
    const uploadType = state.mapVehicle==='auto' ? upload.type : state.mapVehicle;
    const protocols = [...new Set((r.connections.length?r.connections:[r.endpoint]).map(c=>c.protocol))].join(' + ');
    const endpoint = state.mapDetail==='endpoint' ? `${r.endpoint.remoteAddress}:${r.endpoint.remotePort}` : `${r.addresses.size} IP${r.addresses.size===1?'':'s'} · ${r.connections.length} active connection${r.connections.length===1?'':'s'}`;
    return `<article class="transport-route" role="row"><div role="cell"><button class="route-origin" data-app="${esc(r.app)}"><span class="origin-mark">${icon('laptop',18)}</span><strong>${esc(r.app)}</strong><small>PID ${[...r.pids].join(', ')} · ${protocols}${protocols==='UDP'&&r.connections.some(c=>c.remotePort===443)?' / possible QUIC':''}</small></button></div><div class="route-road" role="cell"><div class="route-speeds" title="Smooth average · approximately 10 seconds"><span class="download-rate">↓ ${rate(download.rate)}</span><span class="upload-rate">↑ ${rate(upload.rate)}</span></div><svg class="convoy-svg" data-route-key="${esc(state.mapDetail+'|'+r.key)}" data-download-rate="${r.measured?download.rate:''}" data-upload-rate="${r.measured?upload.rate:''}" data-download-type="${downloadType}" data-upload-type="${uploadType}" viewBox="0 0 600 76" role="img" aria-label="${esc(r.app)} to ${esc(r.service.label)}: ${r.measured?`${Math.round(download.rate)} bytes per second average download, ${Math.round(upload.rate)} average upload`:'route bandwidth unavailable'}"><path d="M20 19h560" class="road incoming-road"/><path d="M20 51h560" class="road outgoing-road"/><path d="M20 35h560" class="road-divider"/></svg>${r.measured && !download.rate && !upload.rate?`<span class="road-idle">${r.connections.length?'Idle':'No active connections'}</span>`:!r.measured?'<span class="road-idle">Awaiting byte-level capture</span>':''}</div><div role="cell"><button class="route-terminal" data-route="${esc(r.key)}">${terminal}<span><strong>${esc(r.service.label)}</strong><small>${esc(endpoint)}</small><em>${r.service.confidence}</em></span>${icon('chevron',14)}</button></div><span role="cell" class="route-usage route-total">${bytes(r.totalBytes60m)}</span><span role="cell" class="route-usage download-rate">${bytes(r.receivedBytes60m)}</span><span role="cell" class="route-usage upload-rate">${bytes(r.sentBytes60m)}</span></article>`;
  }).join('')||`<div class="empty-cell">${state.snapshot?'No routes match this view.':'Waiting for your network…'}</div>`}</div></div><div class="transport-foot"><span>${routes.length} routes${routes.length>visible.length?` · showing ${visible.length}`:''} · usage: last 60 minutes${coverage}. Click a column to sort; click again to reverse.</span>${routes.length>visible.length?'<button class="text-button" data-action="more-routes">Show more routes ↓</button>':''}<span>${state.mode==='demo'?'Illustrative traffic':traffic?.available?'10-second smooth average · sampled every 2 seconds':'Speeds unavailable'}</span></div></section>`;
}
export function routeDetails(route,{esc,rate,bytes,icon},snapshot) {
  return `<div class="route-detail-heading">${terminal}<strong>${esc(route.app)} ↔ ${esc(route.service.label)}</strong></div><div class="route-detail-rates"><span>Download<strong>${rate(route.measured?route.receiveRate:null)}</strong></span><span>Upload<strong>${rate(route.measured?route.sendRate:null)}</strong></span></div><div class="route-detail-usage"><span>Total · 60 min<strong>${bytes(route.totalBytes60m)}</strong></span><span>Download · 60 min<strong>${bytes(route.receivedBytes60m)}</strong></span><span>Upload · 60 min<strong>${bytes(route.sentBytes60m)}</strong></span></div><p class="drawer-copy">${esc(route.service.hint)}. Service labels use DNS cache clues; they identify a possible service, not a physical headquarters or the contents of encrypted traffic.</p><h3>${route.connections.length} connections · ${route.addresses.size} destinations</h3><div class="route-endpoints">${route.connections.map(c=>`<button data-connection="${esc(c.id)}"><span><strong>${esc(c.remoteAddress)}:${c.remotePort}</strong><small>${esc(c.protocol)} · PID ${c.pid} · ${esc(c.state)}</small><small>${(c.domainCandidates||[]).map(esc).join(', ')||'No cached hostname'}</small></span><span>↓ ${rate(c.receiveRate)}<br>↑ ${rate(c.sendRate)}</span>${icon('chevron',14)}</button>`).join('')||'<p class="drawer-copy">No active connections. Usage from completed transfers remains here until it leaves the 60-minute window.</p>'}</div><p class="drawer-copy">${snapshot?.traffic?.timestamp?`Measured ${esc(new Date(snapshot.traffic.timestamp).toLocaleTimeString())}.`:''} UDP peers come from observed network events, including UDP/443 used by QUIC.</p>`;
}

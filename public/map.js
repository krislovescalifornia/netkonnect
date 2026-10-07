import { appIdentity, appName, brandBadge } from './brands.js';
import { buildRoutes, groupApplicationRoutes, transportForRate, JourneyQueue } from './routes.js';
import { renderCity, cityStage } from './cities.js';
import {vehicle,VEHICLE_STAGES,transportSpec} from './vehicles.js';
export {vehicle} from './vehicles.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function journeyPose(journey,progress,cityScene=false) {
  const travel=cityScene&&journey.incoming?Math.min(1,progress/.82):progress;
  const start=cityScene?900:566,end=cityScene?292:34;
  return {x:journey.incoming?start-(start-end)*travel:end+(start-end)*travel,
    y:cityScene?(transportSpec(journey.type).mode==='air'?(journey.incoming?55:85):(journey.incoming?121:149)):(journey.incoming?19:51),
    unloaded:cityScene&&journey.incoming?Math.max(0,Math.min(1,(progress-.84)/.08)):0,
    opacity:cityScene&&journey.incoming?Math.min(1,(1-progress)/.04):1};
}

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
  detach() {
    this.animationTimes=[];
    for(const svg of new Set([...this.svgs.values(),...this.cities.values()])) {
      for(const animation of svg.getAnimations({subtree:true})) {
        this.animationTimes.push({target:animation.effect.target,name:animation.animationName,time:animation.currentTime});
      }
      svg.remove();
    }
  }
  mount(root,{source,active}) {
    this.tick();
    if (source !== this.source) { this.queue = new JourneyQueue(); this.svgs.clear(); this.cities.clear(); this.animationTimes=[]; this.source = source; }
    this.active = active;
    const cities=new Map();
    for(const placeholder of root.querySelectorAll('.application-city')) {
      const key=placeholder.dataset.cityKey,retained=this.cities.get(key);
      const svg=retained||placeholder;
      if(svg!==placeholder) {
        if(svg.dataset.stage!==placeholder.dataset.stage) {
          svg.querySelector('.city-buildings').innerHTML=placeholder.querySelector('.city-buildings').innerHTML;
          svg.dataset.stage=placeholder.dataset.stage;
        }
        svg.setAttribute('class',placeholder.getAttribute('class'));
        svg.setAttribute('aria-label',placeholder.getAttribute('aria-label'));
        svg.dataset.progress=placeholder.dataset.progress;
        for(const name of ['downloadRate','uploadRate','downloadType','uploadType'])svg.dataset[name]=placeholder.dataset[name];
        placeholder.replaceWith(svg);
      }
      cities.set(key,svg);
    }
    this.cities=cities;
    const configurations = [], visible = new Map();
    for (const placeholder of root.querySelectorAll('.convoy-svg')) {
      const key = placeholder.dataset.routeKey;
      const retained = this.svgs.get(key);
      const svg = placeholder.classList.contains('application-city') ? placeholder : retained || placeholder;
      if (retained && svg !== placeholder) {
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
    // Reattaching even the same DOM node creates new CSS Animation objects.
    // Restore each surviving worker/wheel's time before the next painted frame.
    for(const {target,name,time} of this.animationTimes||[])if(target.isConnected&&time!==null) {
      const animation=target.getAnimations().find(a=>a.animationName===name);
      if(animation) {
        if(animation.playState==='paused')animation.currentTime=time;
        else animation.startTime=target.ownerDocument.timeline.currentTime-time/animation.playbackRate;
      }
    }
    this.animationTimes=[];
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
          const spec=transportSpec(journey.type);
          const scale = Math.min(.85,(svg.classList.contains('city-route-scene')?88:53)/spec.width);
          group.innerHTML = `<g transform="scale(${journey.incoming?-scale:scale} ${scale})">${vehicle(journey.type,journey.incoming)}</g>${svg.classList.contains('city-route-scene')&&journey.incoming?'<g class="delivery-parcel" fill="#e6ba72" stroke="#385065" stroke-width="1.1"><path d="M-6-9H6v9H-6z"/><path d="M-5-8 5-1M5-8-5-1"/></g>':''}`;
          svg.append(group);
        }
        existing.delete(journey.id);
        const progress = this.queue.progress(journey);
        const pose=journeyPose(journey,progress,svg.classList.contains('city-route-scene'));
        group.dataset.progress = progress.toFixed(6);
        group.setAttribute('transform',`translate(${pose.x.toFixed(3)} ${pose.y})`);
        group.style.opacity=pose.opacity;
        const cargo=group.querySelector('.vehicle-cargo');if(cargo)cargo.style.opacity=1-pose.unloaded;
        const parcel=group.querySelector('.delivery-parcel');if(parcel) {
          parcel.style.opacity=pose.unloaded;
          parcel.setAttribute('transform',`translate(-8 ${pose.unloaded*(132-pose.y)})`);
        }
      }
      for (const group of existing.values()) group.remove();
      if(svg.classList.contains('application-city')) {
        const working=Number(svg.dataset.downloadRate)>0||journeys.some(j=>j.incoming);
        svg.classList.toggle('city-working',working);svg.classList.toggle('city-resting',!working);
      }
      const idle = svg.parentElement.querySelector('.road-idle');
      if (idle) idle.hidden = journeys.length > 0;
    }
  }
}


export function renderNetworkMap({state,icon,rate,bytes,esc}) {
  const filters = {app:state.mapApp, query:state.mapQuery, detail:state.mapDetail, usageConnections:state.snapshot?.traffic?.usageConnections || [], cityUsage:state.snapshot?.traffic?.cityUsage || [], sort:state.mapSort, direction:state.mapSortDirection};
  const routes = buildRoutes(state.snapshot?.connections || [],filters);
  const apps = [...new Set([...(state.snapshot?.connections||[]), ...(state.snapshot?.traffic?.usageConnections||[])].filter(c=>c.scope==='Internet'&&c.pid!==0).map(c=>c.app))].sort((a,b)=>appName(a).localeCompare(appName(b)));
  const groups = groupApplicationRoutes(routes,{sort:state.mapSort,direction:state.mapSortDirection,cityUsage:filters.cityUsage});
  const visible = groups.slice(0,state.mapLimit);
  state.mapExpanded ??= new Set();
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
    const milestone=stage.known?(stage.next?`${bytes(stage.nextAt-cityBytes)} to ${stage.next}`:'Final city tier'):'Awaiting measured data';
    const level=stage.known?`Level ${stage.index+1} / ${20} · `:'';
    const fleetLabel=`Incoming: ${transportSpec(downloadType).name}; outgoing: ${transportSpec(uploadType).name}`;
    const expanded = parent && state.mapExpanded?.has(r.key);
    const childrenId = 'app-routes-' + encodeURIComponent(r.key);
    const count = parent ? `${r.routes.length} ${state.mapDetail==='endpoint'?'endpoint':'service'}${r.routes.length===1?'':'s'}` : '';
    const endpoint = !parent && state.mapDetail==='endpoint' ? `${r.endpoint.remoteAddress}:${r.endpoint.remotePort}` : `${r.addresses.size} IP${r.addresses.size===1?'':'s'} · ${r.connections.length} active connection${r.connections.length===1?'':'s'}`;
    if(parent) {
      const convoy=`data-route-key="${esc('application|'+r.key)}" data-download-rate="${r.measured?download.rate:''}" data-upload-rate="${r.measured?upload.rate:''}" data-download-type="${downloadType}" data-upload-type="${uploadType}"`;
      return `<article class="transport-route application-parent application-city-card" role="row">
        <div role="cell"><button class="route-origin" data-app="${esc(r.app)}">${brandBadge(appIdentity(r.app),'origin-mark')}<strong>${esc(appName(r.app))}</strong><small>PID ${[...r.pids].join(', ')} · ${protocols}</small></button></div>
        <div class="route-road route-city application-scene" role="cell"><div class="route-speeds" title="Smooth average · approximately 10 seconds"><span class="download-rate">← Download ${rate(download.rate)}</span><span class="upload-rate">Upload ${rate(upload.rate)} →</span></div>${renderCity({key:esc('application|'+r.key),bytes:cityBytes,busy:r.measured&&download.rate>0,airdrop:transportSpec(downloadType).mode==='air',convoy,trafficLabel:esc('Downloads deliver supplies to '+appName(r.app)+'; uploads leave the city; '+fleetLabel)})}<div class="city-caption"><strong>${level}${stage.name}</strong><span>${bytes(cityBytes)} downloaded</span><span class="city-milestone">${milestone}</span>${stage.known?`<div class="city-progress" role="progressbar" aria-label="Growth toward ${stage.next || stage.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(stage.progress*100)}"><i style="width:${stage.progress*100}%"></i></div>`:''}</div>${!r.measured?'<span class="road-idle">Awaiting byte-level capture</span>':!download.rate&&!upload.rate?`<span class="road-idle">${r.connections.length?'Idle':'No active connections'}</span>`:''}</div>
        <div role="cell"><button class="route-terminal route-expand" data-map-expand="${esc(r.key)}" aria-expanded="${expanded?'true':'false'}" aria-controls="${esc(childrenId)}" aria-label="${expanded?'Hide':'Show'} ${count} for ${esc(appName(r.app))}"><span><strong>${count}${state.mapDetail==='service'?' & destinations':''}</strong><small>${r.addresses.size} IP${r.addresses.size===1?'':'s'} · ${r.connections.length} active connection${r.connections.length===1?'':'s'}</small><em>${expanded?'Hide':'Show'} ${state.mapDetail==='endpoint'?'endpoints':'services'}</em></span>${icon('chevron',14)}</button></div>
        <span role="cell" class="route-usage route-total"><small class="usage-label">Total · 60 min</small>${bytes(r.totalBytes60m)}</span><span role="cell" class="route-usage download-rate"><small class="usage-label">Download · 60 min</small>${bytes(r.receivedBytes60m)}</span><span role="cell" class="route-usage upload-rate"><small class="usage-label">Upload · 60 min</small>${bytes(r.sentBytes60m)}</span></article>`;
    }
    return `<article class="transport-route application-child" role="row">
      <div role="cell"><div class="route-child-origin"><strong>${protocols}${protocols==='UDP'&&r.connections.some(c=>c.remotePort===443)?' / possible QUIC':''}</strong><small>PID ${[...r.pids].join(', ')}</small></div></div>
      <div class="route-road" role="cell"><div class="route-speeds" title="Smooth average · approximately 10 seconds"><span class="download-rate">← ${rate(download.rate)}</span><span class="upload-rate">${rate(upload.rate)} →</span></div><svg class="convoy-svg" data-route-key="${esc(state.mapDetail+'|'+r.key)}" data-download-rate="${r.measured?download.rate:''}" data-upload-rate="${r.measured?upload.rate:''}" data-download-type="${downloadType}" data-upload-type="${uploadType}" viewBox="0 0 600 76" role="img" aria-label="${esc(appName(r.app))} to ${esc(r.service.label)}: ${r.measured?`${Math.round(download.rate)} bytes per second average download, ${Math.round(upload.rate)} average upload`:'route bandwidth unavailable'}"><path d="M20 19h560" class="road incoming-road"/><path d="M20 51h560" class="road outgoing-road"/><path d="M20 35h560" class="road-divider"/></svg>${r.measured&&!download.rate&&!upload.rate?`<span class="road-idle">${r.connections.length?'Idle':'No active connections'}</span>`:!r.measured?'<span class="road-idle">Awaiting byte-level capture</span>':''}</div>
      <div role="cell"><button class="route-terminal" data-route="${esc(r.key)}">${brandBadge(r.service,'terminal-icon')}<span><strong>${esc(r.service.label)}</strong><small>${esc(endpoint)}</small><em>${r.service.confidence}</em></span>${icon('chevron',14)}</button></div>
      <span role="cell" class="route-usage route-total"><small class="usage-label">Total · 60 min</small>${bytes(r.totalBytes60m)}</span><span role="cell" class="route-usage download-rate"><small class="usage-label">Download · 60 min</small>${bytes(r.receivedBytes60m)}</span><span role="cell" class="route-usage upload-rate"><small class="usage-label">Upload · 60 min</small>${bytes(r.sentBytes60m)}</span></article>`;


  };
  return `<section class="panel dispatch-panel"><div class="transport-toolbar"><h2>Application cities</h2><div class="transport-controls"><label>Application<select id="map-app"><option value="all">All applications</option>${apps.map(a=>`<option value="${esc(a)}" ${state.mapApp===a?'selected':''}>${esc(appName(a))}</option>`).join('')}</select></label><label>Detail<select id="map-detail"><option value="service" ${state.mapDetail==='service'?'selected':''}>App → service</option><option value="endpoint" ${state.mapDetail==='endpoint'?'selected':''}>App → IP / port</option></select></label><label>Transport<select id="map-vehicle">${[['auto','Automatic · 20 tiers'],...VEHICLE_STAGES.map((s,i)=>[s.id,(i+1)+'. '+s.name])].map(([v,l])=>`<option value="${v}" ${state.mapVehicle===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Sort by<select id="map-sort">${sorts.map(([v,l])=>`<option value="${v}" ${state.mapSort===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="button sort-direction" data-map-sort="${state.mapSort}" aria-label="${state.mapSortDirection==='asc'?'Ascending':'Descending'} order; reverse sort direction" title="${state.mapSortDirection==='asc'?'Ascending':'Descending'} order; reverse sort direction">${state.mapSortDirection==='asc'?'↑':'↓'}</button><label class="route-search">Destination<input id="map-search" value="${esc(state.mapQuery)}" placeholder="YouTube, Firefox, IP…" type="search"></label><button class="button icon-button" data-action="motion" aria-label="${state.motion?'Pause':'Animate'} supplies and construction">${icon(state.motion?'pause':'play',16)}</button></div></div>${!traffic?.available&&state.mode==='live'?`<div class="capture-status">${icon('info',16)}<span>${esc(traffic?.message||'Waiting for network collection…')}<small>Adapter speeds are visible above. Convoys appear when per-route byte measurements are available.</small></span></div>`:''}${traffic?.eventsLost?`<div class="capture-status">${icon('info',16)} Windows dropped ${traffic.eventsLost} trace events; displayed route rates may undercount traffic.</div>`:''}<div class="transport-table" role="table" aria-label="Application cities and traffic; usage columns cover the last 60 minutes"><div class="transport-header" role="row">${sortHeader('app','Application')}<span role="columnheader"><i class="direction-dot incoming-dot"></i> DOWNLOAD ← <i class="direction-dot outgoing-dot"></i> UPLOAD →</span>${sortHeader('service','Service / destination')}${sortHeader('total','Total · 60m')}${sortHeader('download','Download · 60m')}${sortHeader('upload','Upload · 60m')}</div><div class="transport-routes ${active?'':'still'}" role="rowgroup">${visible.map(group=>`<div class="application-group">${renderRoute(group,true)}<div id="${esc('app-routes-'+encodeURIComponent(group.key))}" class="application-children" role="rowgroup" aria-label="${esc(appName(group.app))} associated destinations" ${state.mapExpanded?.has(group.key)?'':'hidden'}>${state.mapExpanded?.has(group.key)?group.routes.map(r=>renderRoute(r)).join(''):''}</div></div>`).join('')||`<div class="empty-cell">${state.snapshot?'No routes match this view.':'Waiting for your network…'}</div>`}</div></div><div class="transport-foot"><button class="text-button" data-page="connections">Inspect connections ${icon('arrow',16)}</button><span>${groups.length} application${groups.length===1?'':'s'} · ${routes.length} ${state.mapDetail==='endpoint'?'endpoint':'service'}${routes.length===1?'':'s'}${groups.length>visible.length?` · showing ${visible.length} application${visible.length===1?'':'s'}`:''} · city size: recorded application downloads · usage columns: last 60 minutes${coverage}.</span>${groups.length>visible.length?'<button class="text-button" data-action="more-routes">Show more applications ↓</button>':''}<span>${state.mode==='demo'?'Illustrative traffic':traffic?.available?'10-second smooth average · sampled every 2 seconds':'Speeds unavailable'}</span></div></section>`;
}
export function routeDetails(route,{esc,rate,bytes,icon},snapshot) {
  return `<div class="route-detail-heading">${brandBadge(appIdentity(route.app))}<strong>${esc(appName(route.app))} ↔ ${esc(route.service.label)}</strong>${brandBadge(route.service)}</div><div class="route-detail-rates"><span>Download<strong>${rate(route.measured?route.receiveRate:null)}</strong></span><span>Upload<strong>${rate(route.measured?route.sendRate:null)}</strong></span></div><div class="route-detail-usage"><span>Total · 60 min<strong>${bytes(route.totalBytes60m)}</strong></span><span>Download · 60 min<strong>${bytes(route.receivedBytes60m)}</strong></span><span>Upload · 60 min<strong>${bytes(route.sentBytes60m)}</strong></span></div><p class="drawer-copy">${esc(route.service.hint)}. Service labels use DNS cache clues; they identify a possible service, not a physical headquarters or the contents of encrypted traffic.</p><h3>${route.connections.length} connections · ${route.addresses.size} destinations</h3><div class="route-endpoints">${route.connections.map(c=>`<div class="route-endpoint"><button data-connection="${esc(c.id)}"><span><strong>${esc(c.remoteAddress)}:${c.remotePort}</strong><small>${esc(c.protocol)} · PID ${c.pid} · ${esc(c.state)}</small><small>${(c.domainCandidates||[]).map(esc).join(', ')||'No cached hostname'}</small></span>${icon('chevron',14)}</button><span>↓ ${rate(c.receiveRate)}<br>↑ ${rate(c.sendRate)}</span></div>`).join('')||'<p class="drawer-copy">No active connections. Usage from completed transfers remains here until it leaves the 60-minute window.</p>'}</div><p class="drawer-copy">${snapshot?.traffic?.timestamp?`Measured ${esc(new Date(snapshot.traffic.timestamp).toLocaleTimeString())}.`:''} UDP peers come from observed network events, including UDP/443 used by QUIC.</p>`;
}

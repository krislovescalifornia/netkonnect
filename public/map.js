import {formatEndpoint} from './address.js';
import { appIdentity, appName, brandBadge } from './brands.js';
import { buildRoutes, groupApplicationRoutes, sortRoutes, transportForRate, JourneyQueue } from './routes.js';
import { renderCity, cityStage, cityConstruction, CITY_STAGES, CITY_ROUTE_SCENE } from './cities.js';
import {materialArtwork,logisticsArtwork,deliveryMaterial,materialTransferPose,terminalGeometry} from './construction-art.js';
import {vehicle,VEHICLE_STAGES,transportSpec,cityVehicleScale} from './vehicles.js';
import { serviceDisplayLabel, transportHint } from './service-evidence.js';
import {evidenceDetails} from './enrichment.js';
import {worldRoute,routePoint,layoutWorld,updateWorldTime,infrastructure,laneLabelPosition,SkySchedule,drawSkySighting} from './world.js';
import {updateSVGMarkup} from './render.js';
export {vehicle} from './vehicles.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Road overlays keep sub-megabit measurements visible.
export function roadSpeed(bytesPerSecond) {
  const value=bytesPerSecond==null||!Number.isFinite(bytesPerSecond)?'—':(Math.max(0,bytesPerSecond)*8/1e6).toFixed(1);
  return `<span class="speed-value">${value} <small>Mbit/s</small></span>`;
}

export function usageGraph(history,direction,known) {
  if(!known)return '<span class="usage-graph-empty" title="Awaiting measured hourly traffic">—</span>';
  const values=Array.from({length:60},(_,i)=>direction==='total'?(history?.[i]?.received||0)+(history?.[i]?.sent||0):(history?.[i]?.[direction]||0));
  const peak=Math.max(1,...values);
  const points=values.map((value,i)=>`${(i*72/59).toFixed(2)},${(23-value/peak*21).toFixed(2)}`).join(' ');
  return `<svg class="usage-graph" viewBox="0 0 72 26" role="img" aria-label="${direction==='received'?'Download':direction==='sent'?'Upload':'Total'} bytes per minute over the last 60 minutes"><title>Last 60 minutes · bytes per minute · oldest on the left</title><path d="M0 24H72" class="usage-baseline"/><polygon points="0,24 ${points} 72,24"/><polyline points="${points}"/></svg>`;
}

export function journeyRoute(journey,sceneEnd=655) {
  const spec=transportSpec(journey.type);
  const points=worldRoute(journey.incoming?'download':'upload',spec.mode,sceneEnd+(spec.mode==='water'?155:0));
  if(journey.incoming)return points;
  // Include the whole silhouette, cart handler and forward lights in the margin.
  const margin=spec.width*cityVehicleScale(spec)/2+40;
  const left=-margin,right=sceneEnd+245+margin;
  return points.map((point,i)=>({...point,x:left+(right-left)*[0,.32,.69,1][i]}));
}

export function journeyPose(journey,progress,cityScene=false,sceneEnd=655,route) {
  if(!cityScene)return {x:journey.incoming?566-532*progress:34+532*progress,y:journey.incoming?19:51,unloaded:0,opacity:1,angle:0};
  const spec=transportSpec(journey.type),mode=spec.mode;
  const points=route||journeyRoute(journey,sceneEnd);
  // Continuous velocity at the bay: decelerate, unload, accelerate out.
  const approach=progress/.62;
  const travel=journey.incoming?(approach<=.8?approach/ .9:approach<1?1-(1-approach)**2/.36:1):1-progress;
  const point=routePoint(points,travel),dock=routePoint(points,1);
  const departureTime=Math.max(0,Math.min(1,(progress-.78)/.22));
  const departure=departureTime<.2?departureTime**2/.36:(departureTime-.1)/.9;
  // Pull into the delivery bay, hold while unloading, then merge and drive out.
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const pullIn=journey.incoming&&mode==='road'?smooth((progress-.50)/.12)*(1-smooth(departureTime/.32))*8:0;
  const offset=mode==='air'?0:mode==='water'?6:11*cityVehicleScale(spec);
  const exit=sceneEnd+245+spec.width*cityVehicleScale(spec)/2;
  return {...point,x:journey.incoming?point.x+(exit-dock.x)*departure:point.x,y:point.y-offset-pullIn,angle:0,
    deliveryX:dock.x,deliveryY:mode==='road'?118:dock.y-offset,
    unloaded:journey.incoming?Math.max(0,Math.min(1,(progress-.65)/.09)):0,
    opacity:journey.incoming?Math.max(0,Math.min(1,(1-progress)/.12)):1};
}

export class TransportAnimator {
  constructor({clock=()=>performance.now(), requestFrame=callback=>requestAnimationFrame(callback), cancelFrame=id=>cancelAnimationFrame(id),wallClock=()=>new Date()} = {}) {
    this.clock = clock; this.requestFrame = requestFrame; this.cancelFrame = cancelFrame;
    this.queue = new JourneyQueue(); this.svgs = new Map(); this.source = null;
    this.vehicleNodes = new WeakMap(); this.sceneSizes = new WeakMap(); this.configurations=[];
    this.deliveryTimes = new WeakMap();
    this.skyScenes = new WeakMap();
    this.wallClock=wallClock;this.worldTimer=null;
    this.lastTime = this.clock(); this.active = false; this.frame = null;
    // Skip paints for cities outside the viewport, without pausing or recreating
    // their timelines. Visibility preserves layout and in-flight geometry.
    this.visibilityObserver=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
      for(const {target,isIntersecting} of entries)target.toggleAttribute('data-offscreen',!isIntersecting);
    });
    this.resizeObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(entries=>{
      for(const {target} of entries)this.resizeCityScene(target,true);
      for(const config of this.configurations) {
        const svg=this.svgs.get(config.routeKey);
        if(svg?.classList.contains('city-route-scene'))config.capacity=Math.min(config.incoming?3:Infinity,this.sceneCapacity(svg));
      }
      this.queue.configure(this.configurations);
      this.draw();
    });
  }
  resizeCityScene(svg,measure=true) {
    if(!svg.classList.contains('city-route-scene'))return;
    const previous=this.sceneSizes.get(svg);
    const {width,height}=measure||!previous?svg.getBoundingClientRect():previous;
    if(!width||!height)return;
    const signature=[width,height,svg.dataset.stage,svg.dataset.downloadType,svg.dataset.uploadType].join('|');
    if(previous?.signature===signature)return;
    this.sceneSizes.set(svg,{width,height,signature});
    const extent=Math.max(360,width/height*CITY_ROUTE_SCENE.height),end=extent-245;
    svg.setAttribute('viewBox',`0 -20 ${extent} ${CITY_ROUTE_SCENE.height}`);
    svg.dataset.sceneEnd=end;
    layoutWorld(svg,end,updateSVGMarkup);
  }
  sceneCapacity(svg) {
    if(!svg.classList.contains('city-route-scene'))return Infinity;
    const stage=Number(svg.dataset.stage)||0;
    return Math.max(1,Math.floor(((Number(svg.dataset.sceneEnd)||655)-28)/(stage>=12?55:stage>=8?70:90)));
  }
  updateWorldClock() {
    const date=this.wallClock();
    for(const svg of this.svgs.values())if(svg.classList.contains('city-route-scene'))updateWorldTime(svg,date);
  }
  tick() {
    const now = this.clock();
    // A stalled/background renderer resumes from its last visible position.
    this.queue.advance(this.active ? Math.min(50,now-this.lastTime) : 0, this.active);
    this.lastTime = now;
  }
  mount(root,{source,active}) {
    this.tick();
    if (source !== this.source) {
      this.resizeObserver?.disconnect();
      this.visibilityObserver?.disconnect();
      for(const svg of this.svgs.values())for(const node of this.vehicleNodes.get(svg)?.values()||[]){node.group.remove();node.parcel?.remove();}
      this.queue = new JourneyQueue(); this.svgs.clear(); this.vehicleNodes=new WeakMap(); this.source = source;
      this.skyScenes=new WeakMap();
    }
    this.active = active;
    const configurations = [], visible = new Map();
    for (const svg of root.querySelectorAll('.convoy-svg')) {
      const key = svg.dataset.routeKey;
      const newScene=this.svgs.get(key)!==svg;
      this.resizeCityScene(svg,newScene);
      const capacity=this.sceneCapacity(svg);
      for (const [direction,incoming] of [['download',true],['upload',false]]) {
        configurations.push({key:`${key}|${direction}`,routeKey:key, incoming,
          rate:svg.dataset[`${direction}Rate`] === '' ? null : Number(svg.dataset[`${direction}Rate`]),
          type:svg.dataset[`${direction}Type`],capacity:incoming&&svg.classList.contains('city-route-scene')?Math.min(3,capacity):capacity});
      }
      visible.set(key,svg);
      if(svg.classList.contains('city-route-scene') && newScene) {this.resizeObserver?.observe(svg);this.visibilityObserver?.observe(svg);}
    }
    for(const [key,svg] of this.svgs)if(visible.get(key)!==svg) {this.resizeObserver?.unobserve(svg);this.visibilityObserver?.unobserve(svg);}
    this.svgs = visible;
    this.updateWorldClock();
    if(this.svgs.size&&!this.worldTimer)this.worldTimer=setInterval(()=>this.updateWorldClock(),30000);
    if(!this.svgs.size&&this.worldTimer){clearInterval(this.worldTimer);this.worldTimer=null;}
    this.configurations=configurations;
    this.queue.configure(configurations);
    this.queue.advance(0,this.active || (this.queue.serial === 0 && this.queue.now === 0));
    this.draw();
    if ((!this.active || !this.svgs.size) && this.frame !== null) { this.cancelFrame(this.frame); this.frame = null; }
    if (this.active && this.svgs.size && this.frame === null) this.schedule();
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
      if(svg.hasAttribute('data-offscreen'))continue;
      if(svg.classList.contains('city-route-scene')) {
        let sky=this.skyScenes.get(svg);
        if(!sky){sky=new SkySchedule(key,this.queue.now);this.skyScenes.set(svg,sky);}
        if(!svg.closest('.still,.no-motion'))drawSkySighting(svg,this.queue.now,sky);
      }
      const journeys = ['download','upload'].flatMap(direction=>this.queue.lanes.get(`${key}|${direction}`)?.vehicles || []);
      let nodes=this.vehicleNodes.get(svg);
      if(!nodes) { nodes=new Map(); this.vehicleNodes.set(svg,nodes); }
      const existing = new Set(nodes.keys());
      for (const journey of journeys) {
        let record = nodes.get(journey.id), group=record?.group;
        if (!group) {
          group = svg.ownerDocument.createElementNS(SVG_NS,'g');
          group.setAttribute('class',`transport-vehicle ${journey.incoming?'incoming-fleet':'outgoing-fleet'}`);
          group.dataset.journeyId = journey.id;
          group.dataset.transport = journey.type;
          const spec=transportSpec(journey.type);
          const scale = svg.classList.contains('city-route-scene')?cityVehicleScale(spec):Math.min(.85,53/spec.width);
          const cityScene=svg.classList.contains('city-route-scene');
          const facing=cityScene?(journey.incoming?scale:-scale):(journey.incoming?-scale:scale);
          const contact=cityScene&&spec.mode!=='air'?spec.mode==='water'
            ?`<path class="vehicle-wake" d="M${(journey.incoming?-1:1)*spec.width*scale*.45} 6h${(journey.incoming?-1:1)*12}m${(journey.incoming?1:-1)*5} 3h${(journey.incoming?-1:1)*9}" />`
            :`<ellipse class="vehicle-contact" cx="0" cy="${11*scale}" rx="${spec.width*scale*.43}" ry="1.1"/>`:'';
          const headlights=cityScene&&spec.mode==='road'?`<g class="vehicle-lights night-light" transform="translate(${(journey.incoming?1:-1)*spec.width*scale*.43} -4) scale(${journey.incoming?1:-1} 1)"><path d="M0 0L36 -3v10L0 2z" fill="#ffe8a2" stroke="none" opacity=".18"/><ellipse cx="0" cy="1" rx="2.3" ry="1.4" fill="#fff1c3" stroke="none"/></g>`:'';
          const material=deliveryMaterial(Number(svg.dataset.stage)||0,journey.id);
          group.innerHTML = `${headlights}${contact}<g transform="scale(${facing} ${scale})">${vehicle(journey.type,journey.incoming,journey.id)}</g>${cityScene&&journey.incoming?`<g class="vehicle-material" transform="translate(-8 -10)">${materialArtwork(material,19)}</g>`:''}`;
          svg.append(group);
          // Speed labels can resize the road on every sample. A journey keeps
          // its departure geometry so a resize cannot teleport its vehicle.
          const parcel=cityScene&&journey.incoming?svg.ownerDocument.createElementNS(SVG_NS,'g'):null;
          if(parcel){
            parcel.setAttribute('class','delivery-parcel material-transfer');parcel.dataset.material=material;parcel.dataset.journeyId=journey.id;
            parcel.innerHTML=`<title>${material} delivered to construction yard</title><path class="unloading-cable" fill="none" stroke="#526a79" stroke-width="1"/><g class="transfer-carrier">${logisticsArtwork('material-trolley',34,19)}</g><g class="transfer-load">${materialArtwork(material,19,-6)}</g><g class="transfer-installer">${logisticsArtwork('bricklayer',11,18)}</g>`;
            svg.append(parcel);
          }
          record={group,cargo:group.querySelector('.vehicle-cargo'),materialCargo:group.querySelector('.vehicle-material'),parcel,material,mode:spec.mode,sceneEnd:Number(svg.dataset.sceneEnd)||655};
          if(parcel){record.carrier=parcel.querySelector('.transfer-carrier');record.installer=parcel.querySelector('.transfer-installer');record.cable=parcel.querySelector('.unloading-cable');}
          if(cityScene)record.route=journeyRoute(journey,record.sceneEnd);
          if(parcel){
            const sites=[...svg.querySelectorAll('.construction-yard')];
            record.siteIndex=journey.id%Math.max(1,sites.length);
            const site=sites[record.siteIndex];
            // Authored anchor -> scene coordinates without per-frame layout reads.
            const extent=record.sceneEnd+245;
            record.destination={x:extent*.16+(Number(site?.dataset.cityX)||220)/330*extent*.78-30,y:28+(Number(site?.dataset.cityY)||90)-12};
            if(['rail','water'].includes(spec.mode))record.hoist=terminalGeometry(spec.mode,record.sceneEnd).rig;
          }
          nodes.set(journey.id,record);
        }
        existing.delete(journey.id);
        const progress = this.queue.progress(journey);
        const pose=journeyPose(journey,progress,svg.classList.contains('city-route-scene'),record.sceneEnd,record.route);
        group.dataset.progress = progress.toFixed(6);
        group.setAttribute('transform',`translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)}) rotate(${pose.angle||0})`);
        group.style.opacity=pose.opacity;
        const {cargo,parcel}=record;if(cargo)cargo.style.opacity=1-pose.unloaded;
        if(record.materialCargo)record.materialCargo.style.opacity=1-pose.unloaded;
        if(parcel) {
          const from={x:pose.deliveryX-8,y:pose.deliveryY-10};
          const transfer=materialTransferPose(progress,{mode:record.mode,from,to:record.destination,hoist:record.hoist});
          parcel.style.opacity=transfer.opacity;
          parcel.dataset.transferProgress=transfer.t.toFixed(4);
          parcel.setAttribute('transform',`translate(${transfer.x.toFixed(3)} ${transfer.y.toFixed(3)})`);
          record.carrier.style.opacity=transfer.carrying?1:0;
          record.installer.style.opacity=transfer.t>=.94?1:0;
          const cable=record.cable;
          cable.style.opacity=transfer.lift?1:0;
          cable.setAttribute('d',`M${(record.hoist?.x||from.x)-transfer.x} ${(record.hoist?.y||from.y)-transfer.y}L0 -8`);
          if(transfer.t>=.94&&!record.stocked){
            record.stocked=true;
            const stock=svg.querySelector(`[data-render-key="stock-${record.siteIndex}"]`)||svg.querySelector('.delivery-stock');
            if(stock){
              let load=stock.querySelector(`[data-stock-material="${record.material}"]`);
              if(!load){
                const slot=stock.children.length;
                load=svg.ownerDocument.createElementNS(SVG_NS,'g');
                load.dataset.stockMaterial=record.material;load.dataset.deliveries=0;
                load.setAttribute('transform',`translate(${slot%4*13-20} ${-Math.floor(slot/4)*8})`);
                load.innerHTML=materialArtwork(record.material,17);stock.append(load);
              }
              // Aggregate repeat loads instead of discarding older pallets.
              load.dataset.deliveries=Number(load.dataset.deliveries)+1;
              load.dataset.deliveryId=journey.id;
            }
            const crane=svg.querySelectorAll('.crane-load')[record.siteIndex%Math.max(1,svg.querySelectorAll('.crane-load').length)];
            if(crane){crane.innerHTML=materialArtwork(record.material,18,12);crane.setAttribute('opacity','1');}
          }
          if(pose.unloaded>0 && !record.delivered) {
            record.delivered=true;
            this.deliveryTimes.set(svg,this.queue.now+1200);
          }
        }
      }
      for (const id of existing) { const record=nodes.get(id);record.group.remove();record.parcel?.remove();nodes.delete(id); }
      if(svg.classList.contains('application-city')) {
        // Retain a transport corridor until its last in-flight journey finishes.
        const modes=journeys.map(j=>transportSpec(j.type).mode);
        const stage=Number(svg.dataset.stage)||0,growth=infrastructure(stage);
        const planned=[svg.dataset.downloadType,svg.dataset.uploadType].map(type=>transportSpec(type).mode);
        for(const [selector,visible] of [['.world-river',growth.port||modes.includes('water')||planned.includes('water')],['.world-port',growth.port||modes.includes('water')||planned.includes('water')],['.world-rail',growth.rail||modes.includes('rail')||planned.includes('rail')],['.world-rail-terminal',growth.rail||modes.includes('rail')||planned.includes('rail')],['.world-airport',growth.airport||modes.includes('air')||planned.includes('air')],['.world-air-terminal',growth.airport||modes.includes('air')||planned.includes('air')]]) {
          const layer=svg.querySelector(selector),value=visible?'1':'0';
          if(layer&&layer.getAttribute('opacity')!==value)layer.setAttribute('opacity',value);
        }
        for(const terminal of svg.querySelectorAll('.freight-terminal'))terminal.classList.toggle('terminal-unloading',journeys.some(j=>j.incoming&&transportSpec(j.type).mode===terminal.dataset.terminalMode&&this.queue.progress(j)>=.62&&this.queue.progress(j)<=.96));
        const working=Number(svg.dataset.downloadRate)>0||journeys.some(j=>j.incoming);
        svg.classList.toggle('city-working',working);svg.classList.toggle('city-resting',!working);
        svg.classList.toggle('city-delivering',this.queue.now<(this.deliveryTimes.get(svg)||0));
      }
      const idle = svg.parentElement.querySelector('.road-idle');
      if (idle) idle.hidden = journeys.length > 0;
    }
  }
}


export function renderNetworkMap({state,icon,rate,bytes,esc,scenes}) {
  const filters = {app:state.mapApp, query:state.mapQuery, detail:state.mapDetail, usageConnections:state.snapshot?.traffic?.usageConnections || [], cityUsage:state.snapshot?.traffic?.cityUsage || [], sort:state.mapSort, direction:state.mapSortDirection};
  const routes = buildRoutes(state.snapshot?.connections || [],filters);
  for(const route of routes) {
    route.sortReceiveRate=state.trafficView?.lane(route,state.mapDetail,'receiveRate').rate??route.receiveRate;
    route.sortSendRate=state.trafficView?.lane(route,state.mapDetail,'sendRate').rate??route.sendRate;
  }
  sortRoutes(routes,state.mapSort,state.mapSortDirection);
  const apps = [...new Set([...(state.snapshot?.connections||[]), ...(state.snapshot?.traffic?.usageConnections||[])].filter(c=>c.scope==='Internet'&&c.pid!==0).map(c=>c.app))].sort((a,b)=>appName(a).localeCompare(appName(b)));
  const groups = groupApplicationRoutes(routes,{sort:state.mapSort,direction:state.mapSortDirection,cityUsage:filters.cityUsage});
  for(const group of groups) {
    group.sortReceiveRate=group.routes.reduce((sum,route)=>sum+route.sortReceiveRate,0);
    group.sortSendRate=group.routes.reduce((sum,route)=>sum+route.sortSendRate,0);
  }
  sortRoutes(groups,state.mapSort,state.mapSortDirection);
  const visible = groups.slice(0,state.mapLimit);
  state.mapExpanded ??= new Set();
  const active = state.motion && !state.paused && !state.reducedMotion;
  const traffic = state.snapshot?.traffic;
  const sorts = [['app','App Name'],['downloadSpeed','Download Speed'],['uploadSpeed','Upload Speed'],['download','Total Download'],['upload','Total Upload'],['total','Total Bandwidth']];
  const sortHeader = (key,label) => `<span role="columnheader" aria-sort="${state.mapSort===key?(state.mapSortDirection==='asc'?'ascending':'descending'):'none'}"><button class="route-sort ${state.mapSort===key?'selected':''}" data-map-sort="${key}" title="Sort by ${label}${['total','download','upload'].includes(key)?' over the last 60 minutes':''}; ${state.mapSort===key?'click again to reverse':'click for ascending order'}">${label}<span aria-hidden="true">${state.mapSort===key?(state.mapSortDirection==='asc'?'↑':'↓'):'↕'}</span></button></span>`;
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
    const milestone=stage.known?(stage.next?`${cityConstruction(stage.index,stage.progress).phase} · ${bytes(stage.nextAt-cityBytes)} to ${stage.next}`:'Final city tier · complete'):'Awaiting measured data';
    const level=stage.known?`Level ${stage.index+1} / ${20} · `:'';
    const growth=stage.known?`<div class="city-download-progress"><div class="city-progress-labels"><span>Start ${bytes(CITY_STAGES[stage.index].at)}</span><span class="city-progress-remaining">${stage.next?`${bytes(stage.nextAt-cityBytes)} to go`:'Complete'}</span><span class="city-progress-finish">Finish ${bytes(stage.nextAt??CITY_STAGES[stage.index].at)} · ${stage.next?`Level ${stage.index+2} · ${stage.next}`:'Final level'}</span></div><div class="city-progress" role="progressbar" aria-label="Growth toward ${stage.next?`Level ${stage.index+2} · ${stage.next}`:'final city level'}" aria-valuetext="${esc(`${bytes(cityBytes)} downloaded · ${milestone}`.replace(/<[^>]*>/g,''))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(stage.progress*100)}"><i style="width:${stage.progress*100}%"></i></div></div>`:'';
    const fleetLabel=`Incoming: ${transportSpec(downloadType).name}; outgoing: ${transportSpec(uploadType).name}`;
    const expanded = parent && state.mapExpanded?.has(r.key);
    const childrenId = 'app-routes-' + encodeURIComponent(r.key);
    const count = parent ? `${r.routes.length} ${state.mapDetail==='endpoint'?'endpoint':'service'}${r.routes.length===1?'':'s'}` : '';
    const endpoint = !parent && (state.mapDetail==='endpoint' || ['unknown','ambiguous','infrastructure'].includes(r.service.kind)) ? `${formatEndpoint(r.endpoint.remoteAddress,r.endpoint.remotePort)} · ${r.connections.length} active` : `${r.addresses.size} IP${r.addresses.size===1?'':'s'} · ${r.connections.length} active connection${r.connections.length===1?'':'s'}`;
    if(parent) {
      const previous=scenes?.get('application|'+r.key);
      const includeArtwork=!previous?.isConnected || Number(previous.dataset.stage)!==stage.index;
      const convoy=`data-route-key="${esc('application|'+r.key)}" data-download-rate="${r.measured?download.rate:''}" data-upload-rate="${r.measured?upload.rate:''}" data-download-type="${downloadType}" data-upload-type="${uploadType}"`;
      const usage=(label,value,direction,css)=>`<span role="cell" class="route-usage ${css}"><span class="usage-reading"><small class="usage-label">${label} · 60 min</small>${bytes(value)}</span>${usageGraph(r.usageHistory,direction,value!==null)}</span>`;
      return `<article class="transport-route application-parent application-city-card" role="row">
        <div class="city-detail-card">
        <div class="route-road route-city application-scene" role="cell"><div class="city-app-heading"><button class="route-origin" data-app="${esc(r.app)}">${brandBadge(appIdentity(r.app),'origin-mark')}<strong>${esc(appName(r.app))}</strong></button></div><div class="route-speeds" title="Smooth average · approximately 10 seconds"><span class="upload-rate" style="--lane-y:${laneLabelPosition(uploadType,'upload')}%" title="Upload travels left toward the app · ${transportSpec(uploadType).mode}"><small>Up</small>${roadSpeed(upload.rate)}</span><span class="download-rate" style="--lane-y:${laneLabelPosition(downloadType,'download')}%" title="Download travels right into the city · ${transportSpec(downloadType).mode}"><small>Down</small>${roadSpeed(download.rate)}</span></div>${renderCity({key:esc('application|'+r.key),bytes:cityBytes,busy:r.measured&&download.rate>0,date:state.worldDate,convoy,includeArtwork,trafficLabel:esc('Downloads travel from the app into its city on the right; uploads return to the app on the left; '+fleetLabel)})}${!r.measured?'<span class="road-idle">Awaiting byte-level capture</span>':!download.rate&&!upload.rate?`<span class="road-idle">${r.connections.length?'Idle':'No active connections'}</span>`:''}</div>
        <div class="city-detail-footer"><div class="city-summary"><div class="city-caption" role="cell" title="${esc(`${level}${stage.name} · ${bytes(cityBytes)} downloaded · ${milestone}`.replace(/<[^>]*>/g,''))}"><strong>${level}${stage.name}</strong>${growth}</div>
        </div><div class="city-services" role="cell"><button class="route-terminal route-expand" data-map-expand="${esc(r.key)}" aria-expanded="${expanded?'true':'false'}" aria-controls="${esc(childrenId)} ${esc(childrenId+'-info')}" aria-label="${expanded?'Hide':'Show'} App Info for ${esc(appName(r.app))}" title="${count} · ${r.addresses.size} IPs · ${r.connections.length} active connections"><span><strong>App Info</strong></span><span class="app-info-caret" aria-hidden="true">&#9662;</span></button></div>
        </div>${expanded?`<div id="${esc(childrenId+'-info')}" class="city-info" role="cell"><div class="city-usage-graphs">${usage('Total',r.totalBytes60m,'total','route-total')}${usage('Download',r.receivedBytes60m,'received','download-rate')}${usage('Upload',r.sentBytes60m,'sent','upload-rate')}</div><div class="city-info-facts"><strong>${count}${state.mapDetail==='service'?' & destinations':''}</strong><span>${r.addresses.size} IP${r.addresses.size===1?'':'s'} · ${r.connections.length} active connection${r.connections.length===1?'':'s'}</span><span>PID ${esc([...r.pids].join(', '))}</span><span>${esc(protocols)}</span></div></div>`:''}</div></article>`;
    }
    return `<article class="transport-route application-child" data-render-key="${esc(state.mapDetail+'|'+r.key)}" role="row">
      <div role="cell"><div class="route-child-origin"><strong>${protocols}${protocols==='UDP'&&r.connections.some(c=>c.remotePort===443)?' / possible QUIC':''}</strong><small>PID ${[...r.pids].join(', ')}</small></div></div>
      <div class="route-road" role="cell"><div class="route-speeds" title="Smooth average · approximately 10 seconds"><span class="download-rate">← ${rate(download.rate)}</span><span class="upload-rate">${rate(upload.rate)} →</span></div><svg class="convoy-svg" data-route-key="${esc(state.mapDetail+'|'+r.key)}" data-download-rate="${r.measured?download.rate:''}" data-upload-rate="${r.measured?upload.rate:''}" data-download-type="${downloadType}" data-upload-type="${uploadType}" viewBox="0 0 600 76" role="img" aria-label="${esc(appName(r.app))} to ${esc(r.service.label)}: ${r.measured?`${Math.round(download.rate)} bytes per second average download, ${Math.round(upload.rate)} average upload`:'route bandwidth unavailable'}"><path d="M20 19h560" class="road incoming-road"/><path d="M20 51h560" class="road outgoing-road"/><path d="M20 35h560" class="road-divider"/></svg>${r.measured&&!download.rate&&!upload.rate?`<span class="road-idle">${r.connections.length?'Idle':'No active connections'}</span>`:!r.measured?'<span class="road-idle">Awaiting byte-level capture</span>':''}</div>
      <div role="cell"><button class="route-terminal" data-route="${esc(r.key)}" title="${esc(r.service.explanation)}">${brandBadge(r.service,'terminal-icon')}<span><strong>${esc(serviceDisplayLabel(r.service))}</strong><small>${esc(endpoint)}</small><em>${esc(r.service.confidence)}</em></span>${icon('chevron',14)}</button></div>
      <span role="cell" class="route-usage route-total"><small class="usage-label">Total · 60 min</small>${bytes(r.totalBytes60m)}</span><span role="cell" class="route-usage download-rate"><small class="usage-label">Download · 60 min</small>${bytes(r.receivedBytes60m)}</span><span role="cell" class="route-usage upload-rate"><small class="usage-label">Upload · 60 min</small>${bytes(r.sentBytes60m)}</span></article>`;


  };
  return `<section class="panel dispatch-panel"><div class="transport-toolbar"><h2>App Filter</h2><div class="transport-controls"><label>Application<select id="map-app"><option value="all">All applications</option>${apps.map(a=>`<option value="${esc(a)}" ${state.mapApp===a?'selected':''}>${esc(appName(a))}</option>`).join('')}</select></label><label>Detail<select id="map-detail"><option value="service" ${state.mapDetail==='service'?'selected':''}>App → service</option><option value="endpoint" ${state.mapDetail==='endpoint'?'selected':''}>App → IP / port</option></select></label><label>Transport<select id="map-vehicle">${[['auto','Automatic · 20 tiers'],...VEHICLE_STAGES.map((s,i)=>[s.id,(i+1)+'. '+s.name])].map(([v,l])=>`<option value="${v}" ${state.mapVehicle===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="route-search">Destination<input id="map-search" value="${esc(state.mapQuery)}" placeholder="YouTube, Firefox, IP…" type="search"></label></div></div>${!traffic?.available&&state.mode==='live'?`<div class="capture-status">${icon('info',16)}<span>${esc(traffic?.message||'Waiting for network collection…')}<small>Adapter speeds are visible above. Convoys appear when per-route byte measurements are available.</small></span></div>`:''}${traffic?.eventsLost?`<div class="capture-status">${icon('info',16)} Windows dropped ${traffic.eventsLost} trace events; displayed route rates may undercount traffic.</div>`:''}<div class="transport-table" role="table" aria-label="Application cities and traffic; usage columns cover the last 60 minutes"><div class="transport-header"><strong class="sort-options-label">Sort Options</strong><div class="sort-option-row" role="row">${sorts.map(([key,label])=>sortHeader(key,label)).join('')}</div></div><div class="transport-routes ${active?'':'still'}" role="rowgroup">${visible.map(group=>`<div class="application-group" data-render-key="${esc(group.key)}">${renderRoute(group,true)}<div id="${esc('app-routes-'+encodeURIComponent(group.key))}" class="application-children" role="rowgroup" aria-label="${esc(appName(group.app))} associated destinations" ${state.mapExpanded?.has(group.key)?'':'hidden'}>${state.mapExpanded?.has(group.key)?group.routes.map(r=>renderRoute(r)).join(''):''}</div></div>`).join('')||`<div class="empty-cell">${state.snapshot?'No routes match this view.':'Waiting for your network…'}</div>`}</div></div><div class="transport-foot"><button class="text-button" data-page="connections">Inspect connections ${icon('arrow',16)}</button><span>${groups.length} application${groups.length===1?'':'s'} · ${routes.length} ${state.mapDetail==='endpoint'?'endpoint':'service'}${routes.length===1?'':'s'}${groups.length>visible.length?` · showing ${visible.length} application${visible.length===1?'':'s'}`:''} · city size: recorded application downloads · usage columns: last 60 minutes${coverage}.</span>${groups.length>visible.length?'<button class="text-button" data-action="more-routes">Show more applications ↓</button>':''}<span>${state.mode==='demo'?'Illustrative traffic':traffic?.available?'10-second smooth average · sampled every 2 seconds':'Speeds unavailable'}</span></div></section>`;
}
export function routeDetails(route,{esc,rate,bytes,icon},snapshot) {
  const identity=route.service, network=identity.network;
  const facts=[['Identification',identity.confidence],['Network provider',network?.name || 'No bundled network match'],
    ['Network range',network?.cidr || 'Unknown'],['Catalog checked',network?.checkedAt || '—']];
  return `<div class="route-detail-heading">${brandBadge(appIdentity(route.app))}<strong>${esc(appName(route.app))} ↔ ${esc(serviceDisplayLabel(identity))}</strong>${brandBadge(identity)}</div>
    <div class="route-detail-rates"><span>Download<strong>${rate(route.measured?route.receiveRate:null)}</strong></span><span>Upload<strong>${rate(route.measured?route.sendRate:null)}</strong></span></div>
    <div class="route-detail-usage"><span>Total · 60 min<strong>${bytes(route.totalBytes60m)}</strong></span><span>Download · 60 min<strong>${bytes(route.receivedBytes60m)}</strong></span><span>Upload · 60 min<strong>${bytes(route.sentBytes60m)}</strong></span></div>
    <h3>What this destination tells us</h3><p class="drawer-copy">${esc(identity.explanation)}</p>
    <dl class="detail-list">${facts.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <p class="drawer-copy">${esc(identity.hint)}${network ? '<br>Network source: '+esc(network.source) : ''}</p>
    ${['unknown','infrastructure'].includes(identity.kind)?'<p class="drawer-copy">Browsers can resolve names through secure DNS without adding them to the Windows cache. A hostname from the browser would help identify this destination.</p>':''}
    <h3>${route.connections.length} connections · ${route.addresses.size} destinations</h3><div class="route-endpoints">${route.connections.map(c=>`<div class="route-endpoint"><button data-connection="${esc(c.id)}"><span><strong>${esc(formatEndpoint(c.remoteAddress,c.remotePort))}</strong><small>${esc(c.protocol)} · PID ${c.pid} · ${esc(c.state)}</small><small>${esc(serviceIdentityHint(c))}</small><small>${esc(transportHint(c))}</small></span>${icon('chevron',14)}</button><span>↓ ${rate(c.receiveRate)}<br>↑ ${rate(c.sendRate)}</span></div>`).join('')||'<p class="drawer-copy">No active connections. Usage from completed transfers remains here until it leaves the 60-minute window.</p>'}</div>
    ${evidenceDetails(route.endpoint,{esc},snapshot)}
    <p class="drawer-copy">${snapshot?.traffic?.timestamp?`Measured ${esc(new Date(snapshot.traffic.timestamp).toLocaleTimeString())}.`:''} Traffic measurements identify the application and endpoint. Browser observations add request context when connected; encrypted content and per-tab bytes remain unavailable.</p>`;
}
const serviceIdentityHint=c=>[...new Set([...(c.browserEvidence||[]).map(r=>r.hostname),...(c.dnsEvidence||[]).map(r=>r.hostname),...(c.domainCandidates||[])])].join(', ')||'No observed hostname';

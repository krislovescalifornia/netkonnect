import { appIdentity, appName, hostnameIdentity } from './brands.js';
export function serviceIdentity(connection) {
  const names = (connection.domainCandidates || []).map(n => n.toLowerCase().replace(/\.$/, ''));
  const labels = names.map(hostnameIdentity).map(identity=>[identity.key, identity]);
  const unique = new Map(labels);
  if (unique.size === 1) { const [, identity] = [...unique][0]; return {...identity, hint: names.join(', '), confidence:'DNS clue'}; }
  if (unique.size > 1) return {key:connection.remoteAddress, label:connection.remoteAddress, hint:`Shared IP · ${names.join(', ')}`, confidence:'Ambiguous DNS'};
  return {key:connection.remoteAddress, label:connection.remoteAddress, hint:'No cached hostname', confidence:'IP only'};
}
export function sortRoutes(routes, sort = 'total', direction = 'desc') {
  const numeric = {total:r=>r.totalBytes60m, download:r=>r.receivedBytes60m, upload:r=>r.sentBytes60m, connections:r=>r.connections.length};
  const value = numeric[sort] || (sort === 'app' ? r=>appName(r.app) : r=>r.service.label);
  const sign = direction === 'asc' ? 1 : -1;
  return routes.sort((a,b) => {
    const av = value(a), bv = value(b);
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    const order = av == null ? 0 : numeric[sort] ? av-bv : av.localeCompare(bv, undefined, {numeric:true, sensitivity:'base'});
    return sign*order || a.app.localeCompare(b.app) || a.service.label.localeCompare(b.service.label) || a.key.localeCompare(b.key);
  });
}
export function buildRoutes(connections, { app = 'all', query = '', detail = 'service', usageConnections = [], cityUsage = [], sort = 'total', direction = 'desc' } = {}) {
  const routes = new Map();
  function routeFor(c) {
    if (c.scope !== 'Internet' || c.pid === 0 || c.state === 'Listen' || (app !== 'all' && c.app !== app)) return null;
    const service = serviceIdentity(c);
    if (![c.app, appName(c.app), service.label, service.hint, c.remoteAddress, c.pid].join(' ').toLowerCase().includes(query.toLowerCase())) return null;
    const destination = detail === 'endpoint' ? `${c.remoteAddress}|${c.remotePort}|${c.protocol}` : service.key;
    const key = `${c.app}|${destination}`;
    if (!routes.has(key)) routes.set(key, {key, app:c.app, service, endpoint:c, connections:[], addresses:new Set(), pids:new Set(), protocols:new Set(), receiveRate:0, sendRate:0, measured:false, receivedBytes60m:null, sentBytes60m:null, totalBytes60m:null});
    const route = routes.get(key);
    route.addresses.add(c.remoteAddress); route.pids.add(c.pid); route.protocols.add(c.protocol);
    return route;
  }
  function addUsage(route, c) {
    if (Number.isFinite(c.receivedBytes60m) && Number.isFinite(c.sentBytes60m)) {
      route.receivedBytes60m = (route.receivedBytes60m || 0) + c.receivedBytes60m;
      route.sentBytes60m = (route.sentBytes60m || 0) + c.sentBytes60m;
      route.totalBytes60m = route.receivedBytes60m + route.sentBytes60m;
    }
  }
  for (const c of connections) {
    const route = routeFor(c);
    if (!route) continue;
    route.connections.push(c);
    if (Number.isFinite(c.receiveRate) && Number.isFinite(c.sendRate)) {
      route.measured = true; route.receiveRate += c.receiveRate; route.sendRate += c.sendRate;
      route.receivedBytes60m ??= 0; route.sentBytes60m ??= 0; route.totalBytes60m ??= 0;
    }
    addUsage(route, c);
  }
  for (const c of usageConnections) {
    const route = routeFor(c);
    if (!route) continue;
    route.measured ||= Number.isFinite(c.receiveRate) && Number.isFinite(c.sendRate);
    addUsage(route, c);
  }
  for(const c of cityUsage) {
    const destination=detail==='endpoint'?`${c.remoteAddress}|${c.remotePort}|${c.protocol}`:(c.service || serviceIdentity(c)).key;
    const route=routes.get(`${c.app}|${destination}`);
    if(!route || !Number.isFinite(c.receivedBytesTotal) || !Number.isFinite(c.sentBytesTotal))continue;
    route.cityBytes=(route.cityBytes || 0)+c.receivedBytesTotal+c.sentBytesTotal;
  }
  return sortRoutes([...routes.values()], sort, direction);
}
export function fleet(rate, type = 'truck') {
  if (!Number.isFinite(rate) || rate <= 0) return {count:0, duration:10};
  // Logarithmic visual density keeps low-volume routes visible without allowing
  // high-throughput streams to create unbounded DOM nodes.
  const load = Math.log2(1 + rate / 8192);
  const duration = Math.max(5, 13-load*.65);
  if (type === 'plane') return {count:Math.min(7,Math.max(1,Math.ceil(load/2))), duration};
  return {count:Math.min(type === 'bicycle' ? 12 : 24,Math.max(1,Math.ceil(load*2))), duration};
}

// Group already filtered routes, so parent totals always describe the children
// shown underneath them. Keep raw route keys for the connection detail drawer.
export function groupApplicationRoutes(routes, {sort = 'total', direction = 'desc'} = {}) {
  const groups = new Map();
  for (const route of routes) {
    const key = appIdentity(route.app).key;
    // Destination sorting uses the first child in the selected route order.
    if (!groups.has(key)) groups.set(key, {key, app:route.app, service:route.service, routes:[], connections:[], addresses:new Set(), pids:new Set(), protocols:new Set(), receiveRate:0, sendRate:0, measured:false, receivedBytes60m:null, sentBytes60m:null, totalBytes60m:null});
    const group = groups.get(key);
    group.routes.push(route);
    if(Number.isFinite(route.cityBytes))group.cityBytes=(group.cityBytes||0)+route.cityBytes;
    group.connections.push(...route.connections);
    for (const address of route.addresses) group.addresses.add(address);
    for (const pid of route.pids) group.pids.add(pid);
    for (const protocol of route.protocols) group.protocols.add(protocol);
    group.receiveRate += route.receiveRate;
    group.sendRate += route.sendRate;
    group.measured ||= route.measured;
    if (route.totalBytes60m !== null) {
      group.receivedBytes60m = (group.receivedBytes60m ?? 0) + route.receivedBytes60m;
      group.sentBytes60m = (group.sentBytes60m ?? 0) + route.sentBytes60m;
      group.totalBytes60m = group.receivedBytes60m + group.sentBytes60m;
    }
  }
  return sortRoutes([...groups.values()], sort, direction);
}

export const LOW_TRAFFIC_LIMIT = 64 * 1024;
export const HIGH_TRAFFIC_LIMIT = 1024 * 1024;
export function transportForRate(rate, previous) {
  // A 20% buffer keeps a lane from swapping vehicles near a category boundary.
  const low = LOW_TRAFFIC_LIMIT * (previous === 'bicycle' ? 1.2 : previous ? .8 : 1);
  const high = HIGH_TRAFFIC_LIMIT * (previous === 'plane' ? .8 : previous ? 1.2 : 1);
  return rate < low ? 'bicycle' : rate < high ? 'truck' : 'plane';
}

// This cache belongs to the Service view. Collector rates and hourly byte totals
// stay exact, and UI redraws never count the same collector sample twice.
export class RouteTrafficView {
  constructor() { this.reset(); }
  reset() { this.source = null; this.at = null; this.lanes = new Map(); }
  update(snapshot, source) {
    if (source !== this.source) { this.reset(); this.source = source; }
    if (!snapshot?.traffic?.available) { this.at = null; this.lanes.clear(); return; }
    const at = Date.parse(snapshot.traffic.timestamp || snapshot.timestamp);
    if (!Number.isFinite(at) || at === this.at) return;
    if (this.at !== null && (at < this.at || at - this.at > 30000)) this.lanes.clear();
    this.at = at;
    const seen = new Set();
    for (const detail of ['application', 'service', 'endpoint']) {
      const children = buildRoutes(snapshot.connections || [], {detail:detail === 'application' ? 'service' : detail, usageConnections:snapshot.traffic.usageConnections || []});
      const routes = detail === 'application' ? groupApplicationRoutes(children) : children;
      for (const route of routes) for (const direction of ['receiveRate', 'sendRate']) {
        const key = `${detail}|${route.key}|${direction}`;
        if (!route.measured) continue;
        seen.add(key);
        const value = Math.max(0, route[direction]);
        const prior = this.lanes.get(key);
        const elapsed = prior ? Math.max(0, at - prior.at) : 0;
        const alpha = 1 - Math.exp(-elapsed / 10000);
        const idleSince = value > 0 ? null : prior?.idleSince ?? at;
        let average = prior ? prior.rate + alpha * (value - prior.rate) : value;
        // Allow brief gaps between streaming bursts, then bring truly idle lanes
        // to rest rather than displaying an infinitesimal EMA forever.
        if (idleSince !== null && at - idleSince >= 20000) average = 0;
        this.lanes.set(key, {rate:average, type:transportForRate(average, prior?.type), at, idleSince});
      }
    }
    for (const key of this.lanes.keys()) if (!seen.has(key)) this.lanes.delete(key);
  }
  lane(route, detail, direction) {
    return this.lanes.get(`${detail}|${route.key}|${direction}`) || {
      rate:route.measured ? route[direction] : null, type:transportForRate(route[direction])
    };
  }
}

const JOURNEY_MS = 12000;

// A departure owns its type and arrival time for its entire journey. Samples
// only change the departure schedule, never an existing vehicle's position.
export class JourneyQueue {
  constructor() { this.now = 0; this.serial = 0; this.lanes = new Map(); }
  configure(configurations) {
    const visible = new Set();
    for (const {key, rate, type, incoming} of configurations) {
      visible.add(key);
      const count = fleet(rate,type).count;
      let lane = this.lanes.get(key);
      if (!lane) {
        lane = {vehicles:[], lastDeparture:null, nextDeparture:null, count:0};
        this.lanes.set(key,lane);
      }
      if (count !== lane.count) {
        const next = count ? Math.max(this.now, (lane.lastDeparture ?? this.now-JOURNEY_MS) + JOURNEY_MS/count) : null;
        // Slower traffic must not postpone an already scheduled departure on
        // every sample. Apply the slower interval after that vehicle leaves.
        lane.nextDeparture = count && lane.nextDeparture !== null ? Math.min(lane.nextDeparture,next) : next;
      }
      Object.assign(lane,{count,type,incoming,visible:true});
    }
    for (const [key,lane] of this.lanes) if (!visible.has(key)) {
      lane.count = 0; lane.nextDeparture = null; lane.visible = false;
    }
  }
  advance(elapsed, depart = true) {
    this.now += Math.max(0,elapsed);
    for (const [key,lane] of this.lanes) {
      lane.vehicles = lane.vehicles.filter(v=>this.now < v.arrives);
      if (depart && lane.count && lane.nextDeparture <= this.now) {
        lane.vehicles.push({id:++this.serial, type:lane.type, incoming:lane.incoming, started:this.now, arrives:this.now+JOURNEY_MS});
        lane.lastDeparture = this.now;
        // No catch-up burst after a background tab, pause, or slow frame.
        lane.nextDeparture = this.now + JOURNEY_MS/lane.count;
      }
      if (!lane.visible && !lane.vehicles.length) this.lanes.delete(key);
    }
  }
  progress(journey) { return Math.max(0,Math.min(1,(this.now-journey.started)/(journey.arrives-journey.started))); }
}

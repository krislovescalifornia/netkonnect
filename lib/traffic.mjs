import { scope } from './network.mjs';
export const flowId = c => [c.protocol, c.pid, c.localAddress, c.localPort, c.remoteAddress, c.remotePort].join('|');
export const USAGE_WINDOW_MS = 60 * 60 * 1000;

export class TrafficStore {
  constructor() { this.available = false; this.message = 'Starting detailed traffic capture…'; this.flows = new Map(); this.usage = new Map(); this.usageStartedAt = null; this.updated = 0; this.eventsLost = 0; }
  pruneUsage(now) {
    for (const [key, record] of this.usage) {
      while (record.head < record.samples.length && record.samples[record.head].at <= now - USAGE_WINDOW_MS) {
        const sample = record.samples[record.head++];
        record.receivedBytes60m -= sample.received;
        record.sentBytes60m -= sample.sent;
      }
      if (record.head === record.samples.length) this.usage.delete(key);
      else if (record.head > 128) { record.samples = record.samples.slice(record.head); record.head = 0; }
    }
  }
  ingest(batch, now = Date.now(), snapshot = null) {
    this.pruneUsage(now);
    if (batch.type === 'status') {
      this.available = batch.available === true;
      this.message = batch.message || (this.available ? '' : 'Detailed traffic capture is unavailable.');
      if (!this.available) this.flows.clear();
      return;
    }
    if (batch.type !== 'traffic' || !(batch.elapsed > 0)) return;
    this.usageStartedAt ??= now;
    this.available = true; this.updated = now; this.eventsLost = batch.eventsLost || 0;
    const snapshotFlows = new Map((snapshot?.connections || []).map(c => [flowId(c), c]));
    for (const flow of this.flows.values()) { flow.receiveRate = 0; flow.sendRate = 0; }
    for (const c of batch.flows || []) {
      const id = flowId(c), prior = this.flows.get(id);
      const existing = snapshotFlows.get(id);
      const app = existing?.app || snapshot?.processes?.[c.pid];
      // Aggregate socket churn by application and endpoint, independently of the
      // short-lived live flow cache. Each interval expires exactly one hour later.
      const usageKey = [app || `PID ${c.pid}`, c.protocol, c.remoteAddress, c.remotePort].join('|');
      if (c.receivedBytes > 0 || c.sentBytes > 0) {
        let record = this.usage.get(usageKey);
        if (!record) {
          record = { ...c, app, scope: scope(c.remoteAddress), domainCandidates: existing?.domainCandidates || [],
            samples: [], head: 0, receivedBytes60m: 0, sentBytes60m: 0 };
          this.usage.set(usageKey, record);
        }
        const last = record.samples.at(-1);
        if (last?.at === now) { last.received += c.receivedBytes; last.sent += c.sentBytes; }
        else record.samples.push({ at: now, received: c.receivedBytes, sent: c.sentBytes });
        record.receivedBytes60m += c.receivedBytes;
        record.sentBytes60m += c.sentBytes;
      }
      this.flows.set(id, { ...c, app: app || prior?.app, id, receivedBytes: (prior?.receivedBytes || 0) + c.receivedBytes,
        sentBytes: (prior?.sentBytes || 0) + c.sentBytes, receiveRate: c.receivedBytes / batch.elapsed,
        sendRate: c.sentBytes / batch.elapsed, firstSeen: prior?.firstSeen || batch.timestamp, lastSeen: batch.timestamp, observedAt: now });
    }
    for (const [id, flow] of this.flows) if (now - flow.observedAt > 30000) this.flows.delete(id);
    if (this.flows.size > 20000) for (const id of [...this.flows.keys()].slice(0, this.flows.size - 20000)) this.flows.delete(id);
  }
  decorate(snapshot, now = Date.now(), cityUsage = []) {
    if (!snapshot) return null;
    this.pruneUsage(now);
    const fresh = this.available && this.updated > 0 && now - this.updated < 7000;
    const processes = snapshot.processes || {};
    const dns = new Map();
    for (const record of snapshot.dnsRecords || []) {
      if (!dns.has(record.address)) dns.set(record.address, new Set());
      dns.get(record.address).add(record.name);
    }
    const base = new Map(snapshot.connections.map(c => [flowId(c), { ...c,
      receiveRate: fresh ? 0 : null, sendRate: fresh ? 0 : null, trafficSource: fresh ? 'ETW' : null }]));
    for (const [id, flow] of this.flows) {
      const existing = base.get(id);
      const candidates = existing?.domainCandidates || [...(dns.get(flow.remoteAddress) || [])];
      base.set(id, { ...flow, ...existing, id, app: existing?.app || flow.app || processes[flow.pid] || (flow.pid ? `Process ${flow.pid}` : 'Unattributed'),
        scope: existing?.scope || scope(flow.remoteAddress), domainCandidates: candidates,
        state: existing?.state || 'Observed', firstSeen: existing?.firstSeen || flow.firstSeen,
        receiveRate: fresh ? flow.receiveRate : null, sendRate: fresh ? flow.sendRate : null,
        receivedBytes: flow.receivedBytes, sentBytes: flow.sentBytes, lastSeen: flow.lastSeen, trafficSource: 'ETW' });
    }
    const usageConnections = [...this.usage.values()].map(record => {
      const knownApp = processes[record.pid] || base.get(flowId(record))?.app;
      if (!record.app && knownApp && knownApp !== `Process ${record.pid}`) record.app = knownApp;
      const candidates = [...(dns.get(record.remoteAddress) || [])];
      if (candidates.length) record.domainCandidates = candidates;
      // Fixed one-minute bins span exactly the same rolling hour as the totals.
      const usageHistory = Array.from({length:60},()=>({received:0,sent:0}));
      for(let i=record.head;i<record.samples.length;i++) {
        const sample=record.samples[i];
        const index=Math.max(0,Math.min(59,Math.ceil((sample.at-(now-USAGE_WINDOW_MS))/60000)-1));
        usageHistory[index].received+=sample.received;
        usageHistory[index].sent+=sample.sent;
      }
      return { app: record.app || (record.pid ? `Process ${record.pid}` : 'Unattributed'), pid: record.pid,
        protocol: record.protocol, remoteAddress: record.remoteAddress, remotePort: record.remotePort,
        scope: record.scope, domainCandidates: record.domainCandidates,
        receivedBytes60m: record.receivedBytes60m, sentBytes60m: record.sentBytes60m,
        usageHistory,
        receiveRate: fresh ? 0 : null, sendRate: fresh ? 0 : null };
    });
    return { ...snapshot, dnsRecords: undefined, processes: undefined, connections: [...base.values()], traffic: {
      available: fresh, starting: this.available && !this.updated, eventsLost: this.eventsLost,
      usageConnections, cityUsage, usageStartedAt: this.usageStartedAt === null ? null : new Date(this.usageStartedAt).toISOString(),
      timestamp: this.updated ? new Date(this.updated).toISOString() : null,
      message: !this.available ? this.message : fresh ? '' : this.updated ? 'Detailed traffic capture is stale. Restart the collector.' : 'Waiting for the first traffic interval…' } };
  }
}

export function scope(address) {
  if (address?.toLowerCase().startsWith('::ffff:')) return scope(address.slice(7));
  if (!address || address === '0.0.0.0' || address === '::' || address === '*') return 'Unbound';
  if (address === '::1' || address.startsWith('127.')) return 'Loopback';
  if (address.startsWith('10.') || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || /^(fe80:|f[cd])/i.test(address) || address.startsWith('169.254.')) return 'Local';
  return 'Internet';
}

export function enrichSnapshot(raw, previous, history = [], sightings = new Map()) {
  const elapsed = previous ? (Date.parse(raw.timestamp) - Date.parse(previous.timestamp)) / 1000 : 0;
  const adapters = (raw.adapters || []).map(adapter => {
    const prior = previous?.adapters.find(a => a.id === adapter.id);
    const rate = key => elapsed > 0 && prior ? Math.max(0, ((adapter[key] || 0) - (prior[key] || 0)) / elapsed) : null;
    return { ...adapter, receiveRate: rate('receivedBytes'), sendRate: rate('sentBytes') };
  });
  const timestamp = raw.timestamp;
  const connections = (raw.connections || []).map(c => {
    const id = [c.protocol, c.pid, c.localAddress, c.localPort, c.remoteAddress, c.remotePort].join('|');
    const domainCandidates = [...new Set((raw.dns || []).filter(d => d.address === c.remoteAddress).map(d => d.name))];
    if (!sightings.has(id)) sightings.set(id, { firstSeen: timestamp, lastSeen: timestamp, ...c });
    const sighting = sightings.get(id);
    sighting.lastSeen = timestamp;
    return { ...c, id, scope: scope(c.remoteAddress), domainCandidates, firstSeen: sighting.firstSeen };
  });
  const oldest = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, value] of sightings) if (Date.parse(value.lastSeen) < oldest) sightings.delete(id);
  if (sightings.size > 20000) for (const id of [...sightings.keys()].slice(0, sightings.size - 20000)) sightings.delete(id);
  const totals = adapters.filter(a => a.status === 'Up').reduce((t, a) => ({ receiveRate: t.receiveRate + (a.receiveRate || 0), sendRate: t.sendRate + (a.sendRate || 0) }), { receiveRate: 0, sendRate: 0 });
  const point = { timestamp, ...totals, connections: connections.filter(c => c.state === 'Established').length };
  return { ...raw, dns: undefined, dnsRecords: raw.dns || [], adapters, connections, totals: { ...totals, ready: elapsed > 0 && adapters.length > 0 }, history: [...history, point].slice(-120), sightings: [...sightings.values()].sort((a,b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen)).slice(0,1000), mode: 'live' };
}

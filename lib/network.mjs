import { addressKey,parseAddress } from '../public/address.js';
import { cachedDns, dnsIndex, dnsSourceIndex, hostsRecords, netbiosRecords } from './dns.mjs';
import {connectionPath} from './evidence.mjs';

export function scope(address) {
  const parsed=parseAddress(address);
  if (!parsed || parsed.value===0n) return 'Unbound';
  if(parsed.bits===128) {
    if(parsed.value===1n)return 'Loopback';
    if((parsed.value>>121n)===126n || (parsed.value>>118n)===1018n || (parsed.value>>120n)===255n)return 'Local';
  } else {
    address=parsed.key;
    if(address.startsWith('127.'))return 'Loopback';
    if(address.startsWith('10.') || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || address.startsWith('169.254.'))return 'Local';
    if((parsed.value>>28n)===14n || parsed.value===0xffffffffn)return 'Local';
  }
  return 'Internet';
}

export function enrichSnapshot(raw, previous, history = [], sightings = new Map()) {
  const elapsed = previous ? (Date.parse(raw.timestamp) - Date.parse(previous.timestamp)) / 1000 : 0;
  const adapters = (raw.adapters || []).map(adapter => {
    const prior = previous?.adapters.find(a => a.id === adapter.id);
    const rate = key => elapsed > 0 && Number.isFinite(adapter[key]) && Number.isFinite(prior?.[key]) ? Math.max(0, (adapter[key] - prior[key]) / elapsed) : null;
    return { ...adapter, receiveRate: rate('receivedBytes'), sendRate: rate('sentBytes') };
  });
  const timestamp = raw.timestamp;
  const hosts=hostsRecords(raw.hosts);
  const netbios=netbiosRecords(raw.netbiosCache);
  const dnsRecords = [...cachedDns([...(raw.dns||[]),...netbios], previous?.dnsRecords?.filter(r=>r.source!=='hosts-file'), timestamp), ...hosts], dns = dnsIndex(dnsRecords);
  const nameSources=dnsSourceIndex(dnsRecords);
  const collectionSources={...raw.collectionSources};
  if(collectionSources['hosts-file'])collectionSources['hosts-file']={...collectionSources['hosts-file'],count:hosts.length};
  if(collectionSources['netbios-cache'])collectionSources['netbios-cache']={...collectionSources['netbios-cache'],count:netbios.length};
  const priorConnections = new Map((previous?.connections || []).map(c => [c.id, c]));
  const connections = (raw.connections || []).map(c => {
    const id = [c.protocol, c.pid, c.localAddress, c.localPort, c.remoteAddress, c.remotePort].join('|');
    const current = [...(dns.get(addressKey(c.remoteAddress)) || [])];
    const priorConnection=priorConnections.get(id);
    const sameOwner=!raw.processDetails?.[c.pid]?.startedAt||!priorConnection?.owner?.startedAt||raw.processDetails[c.pid].startedAt===priorConnection.owner.startedAt;
    const prior = sameOwner ? priorConnection?.domainCandidates || [] : [];
    // Preserve clues on the same continuously observed socket, not across IPs
    // or a disappeared/recreated connection. Keep conflicts visible.
    const domainCandidates = [...new Set([...current, ...prior])];
    const domainNameSources=[...new Set([...(nameSources.get(addressKey(c.remoteAddress))||[]),...(sameOwner?priorConnection?.domainNameSources||[]:[])])];
    if (!sightings.has(id) || !sameOwner) sightings.set(id, { firstSeen: timestamp, lastSeen: timestamp, ...c });
    const sighting = sightings.get(id);
    sighting.lastSeen = timestamp;
    return { ...c, id, scope: scope(c.remoteAddress), owner:raw.processDetails?.[c.pid]||null,networkPath:connectionPath(c,raw), domainCandidates,domainNameSources, domainEvidence:current.length ? 'cache' : prior.length ? 'earlier-flow' : null, firstSeen: sighting.firstSeen };
  });
  const oldest = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, value] of sightings) if (Date.parse(value.lastSeen) < oldest) sightings.delete(id);
  if (sightings.size > 20000) for (const id of [...sightings.keys()].slice(0, sightings.size - 20000)) sightings.delete(id);
  const totals = adapters.filter(a => a.status === 'Up' && !a.loopback).reduce((t, a) => ({ receiveRate: t.receiveRate + (a.receiveRate || 0), sendRate: t.sendRate + (a.sendRate || 0) }), { receiveRate: 0, sendRate: 0 });
  const point = { timestamp, ...totals, connections: connections.filter(c => c.state === 'Established').length };
  return { ...raw, collectionSources,dns: undefined, hosts:undefined,netbiosCache:undefined, dnsRecords, adapters, connections, totals: { ...totals, ready: adapters.some(a=>!a.loopback&&(a.receiveRate!==null || a.sendRate!==null)) }, history: [...history, point].slice(-120), sightings: [...sightings.values()].sort((a,b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen)).slice(0,1000), mode: 'live' };
}

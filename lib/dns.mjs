import { addressKey, parseAddress } from '../public/address.js';

const hostname = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : '';
export function hostsRecords(lines = []) {
  return lines.flatMap(line => {
    const [address, ...names] = String(line).split('#', 1)[0].trim().split(/\s+/);
    if (!parseAddress(address)) return [];
    return names.filter(name => name.length <= 253 && /^[a-z0-9_.-]+$/i.test(name)).map(name => ({name:hostname(name), address:addressKey(address), source:'hosts-file'}));
  });
}
export function netbiosRecords(lines = []) {
  return lines.flatMap(line=>{
    // Cache display only. Group/workgroup/user names are not host identities.
    const match=String(line).match(/^\s*([a-z0-9_.-]{1,15})\s+<(?:00|20)>\s+UNIQUE\s+(\d+\.\d+\.\d+\.\d+)\s+(-?\d+)\s*$/i);
    if(!match||!parseAddress(match[2]))return [];
    const ttl=Number(match[3]);
    return [{name:hostname(match[1]),address:addressKey(match[2]),source:'netbios-cache',...(ttl>=0?{ttl}:{})}];
  });
}
export function ptrAddress(name) {
  const value=hostname(name);
  if(value.endsWith('.in-addr.arpa')) {
    const parts=value.slice(0,-13).split('.');
    if(parts.length===4)return parseAddress(parts.reverse().join('.'))?.key || null;
  }
  if(value.endsWith('.ip6.arpa')) {
    const parts=value.slice(0,-9).split('.');
    if(parts.length===32 && parts.every(p=>/^[0-9a-f]$/.test(p))) {
      return parseAddress(parts.reverse().join('').match(/.{4}/g).join(':'))?.key || null;
    }
  }
  return null;
}
// Names stay passive: only join cache records and aliases already observed.
export function dnsSourceIndex(records = []) {
  const sources=new Map();
  for(const record of records) {
    const address=record.type===12?ptrAddress(record.recordName||record.name):parseAddress(record.address)?.key;
    if(!address)continue;
    if(!sources.has(address))sources.set(address,new Set());
    sources.get(address).add(record.source||'dns-cache');
  }
  return sources;
}
export function dnsIndex(records = []) {
  const addresses = new Map(), aliases = new Map(), result = new Map();
  const add = (map, key, value) => {
    if (!key || !value) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };
  for (const record of records) {
    const name = hostname(record.name), canonical = hostname(record.recordName);
    if(record.type===12) {
      add(result, ptrAddress(canonical)||ptrAddress(name), hostname(record.target));
      continue;
    }
    if (parseAddress(record.address)) {
      const address = addressKey(record.address);
      add(addresses, name, address); add(addresses, canonical, address);
      add(result, address, name);
    } else if (record.target) {
      add(aliases, name, hostname(record.target));
      add(aliases, canonical, hostname(record.target));
    }
  }
  for (const record of records.filter(r => r.target && r.type!==12)) {
    const name = hostname(record.name), pending = [hostname(record.target)], visited = new Set();
    // Limit malformed/cyclic alias chains without making any external request.
    while (pending.length && visited.size < 64) {
      const target = pending.pop();
      if (!target || visited.has(target)) continue;
      visited.add(target);
      for (const address of addresses.get(target) || []) add(result, address, name);
      pending.push(...(aliases.get(target) || []));
    }
  }
  return result;
}

export function cachedDns(records, previous, timestamp) {
  const at = Date.parse(timestamp), retained = new Map();
  const key = r => [hostname(r.name), hostname(r.recordName), addressKey(r.address), hostname(r.target)].join('|');
  // A missing record can still be valid until its observed Windows TTL expires.
  // Older collectors without TTL get no synthetic cache lifetime.
  for (const record of previous || []) if (record.expiresAt > at) retained.set(key(record), record);
  for (const record of records || []) {
    const expiresAt = Number.isFinite(record.ttl) ? at + Math.max(0, record.ttl) * 1000 : null;
    if (expiresAt !== null && expiresAt <= at) { retained.delete(key(record)); continue; }
    retained.set(key(record), {...record, expiresAt});
  }
  return [...retained.values()];
}

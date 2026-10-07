const browserName=records=>[...new Set(records.map(r=>({firefox:'Firefox',chrome:'Chrome',edge:'Edge'}[r.source]||'Firefox')))].join(' / ');
import { hostnameIdentity } from './brands.js';
import { parseAddress, parsePrefix, inPrefix } from './address.js';
import { providerCatalog } from './providers.js';

const networks = providerCatalog.flatMap(provider => provider.prefixes.map(cidr => ({provider, cidr, prefix:parsePrefix(cidr)})))
  .sort((a,b) => b.prefix.length - a.prefix.length);
const networkCache = new Map();
export function networkIdentity(address) {
  if (networkCache.has(address)) return networkCache.get(address);
  const parsed = parseAddress(address), match = networks.find(n => inPrefix(parsed, n.prefix));
  const identity = match ? {name:match.provider.name, logo:match.provider.logo, cidr:match.cidr, source:match.provider.source, checkedAt:match.provider.checkedAt} : null;
  if (networkCache.size >= 4096) networkCache.delete(networkCache.keys().next().value);
  networkCache.set(address, identity);
  return identity;
}
export function serviceIdentity(connection) {
  const browser=(connection.browserEvidence||[]).filter(r=>r.hostname&&!r.proxied);
  const processDns=(connection.dnsEvidence||[]).filter(r=>r.hostname);
  const cached=connection.domainCandidates||[],ptr=!browser.length&&!processDns.length&&!cached.length?(connection.enhancedLookup?.hostnames||[]):[];
  const localName=(connection.domainNameSources||[]).some(s=>['hosts-file','netbios-cache'].includes(s));
  const source=browser.length?`${browserName(browser)} request`:processDns.length?'Process DNS event':ptr.length?'Reverse DNS':localName?'Local name':'DNS';
  const selected=browser.length?browser.map(r=>r.hostname):processDns.length?processDns.map(r=>r.hostname):cached.length?cached:ptr;
  const names = [...new Set(selected.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim().toLowerCase().replace(/\.$/, '')))];
  const identities=names.map(hostnameIdentity);
  const tvContext=browser.length&&browser.every(r=>r.site==='tv.youtube.com')&&identities.every(i=>['youtube-video','youtube-tv'].includes(i.key));
  const unique = new Map((tvContext?[hostnameIdentity('tv.youtube.com')]:identities).map(identity => [identity.key, identity]));
  const registry=connection.enhancedLookup?.network;
  const network = networkIdentity(connection.remoteAddress)||(registry?.name?{name:registry.owner||registry.name,cidr:`${registry.startAddress} – ${registry.endAddress}`,source:registry.source,checkedAt:connection.enhancedLookup.lookedUpAt,registry:true}:null);
  if (unique.size === 1) {
    const identity = [...unique.values()][0];
    const earlier = connection.domainEvidence === 'earlier-flow'&&!browser.length&&!processDns.length&&!ptr.length;
    return {...identity, kind:identity.logo ? 'service' : 'hostname', network, hint:names.join(', '), confidence:earlier ? (localName?'Earlier local name clue':'Earlier DNS clue') : `${source} clue`,
      explanation:browser.length?(tvContext?`${browserName(browser)} observed YouTube video requests in a tv.youtube.com page context.`:`${browserName(browser)} observed requests to these hostnames at this server IP and port.`)+` The browser API does not expose the local socket or per-tab bytes. Shared connections can carry several requests; measured traffic remains attributed to ${browserName(browser)} and this endpoint.`
      :processDns.length?'Windows observed this process resolving the hostname to this IP. Resolution is a destination clue; it does not prove that every byte on the connection belongs to that hostname.'
      :ptr.length?'An explicitly requested online reverse-DNS lookup returned this hostname. PTR names are assigned by the address operator; they are a naming clue, not proof that the application contacted that service.'
      :(earlier ? 'Hostname clues retained from an earlier observation of this connection. ' : '') + (identity.key === 'youtube-video' ? 'YouTube video delivery hostname observed. YouTube and YouTube TV share video infrastructure; this does not identify the browser tab or program.' : 'Matching hostnames were observed in the Windows DNS cache, local hosts file or NetBIOS name cache. Cached reverse names and static aliases are naming clues; they do not prove which service or browser tab used this connection.')};
  }
  if (unique.size > 1) return {key:connection.remoteAddress, label:connection.remoteAddress, kind:'ambiguous', network,
    hint:`Shared IP · ${names.join(', ')}`, confidence:`Ambiguous ${source}`, explanation:'Several different destinations share this IP address. The available hostname clues cannot identify which one this connection used.'};
  return {key:connection.remoteAddress, label:network ? `${network.name} network · service unknown` : connection.remoteAddress,
    logo:network?.logo, kind:network ? 'infrastructure' : 'unknown', network, hint:network ? `${network.name} network range ${network.cidr}; no cached hostname` : 'No cached hostname',
    confidence:network ? 'Network hint only' : 'IP only', explanation:network
      ? `This address matches ${network.registry?'an explicitly requested registry lookup for':'a bundled'} ${network.name} network range. That identifies infrastructure, not the website, streaming service, or customer hosted there. No hostname was observed.`
      : 'No matching hostname or bundled network range was observed. Encrypted browser DNS, an expired cache entry, or a direct IP connection can leave the destination unidentified.'};
}
export const serviceDisplayLabel = identity => identity.kind === 'unknown' ? 'Unidentified service' : identity.kind === 'ambiguous' ? 'Shared destination · service uncertain' : identity.label;
export function transportHint(connection) {
  const observed=[...new Set((connection.browserEvidence||[]).flatMap(r=>[r.httpVersion,r.security?.protocolVersion]).filter(Boolean))];
  if(observed.length)return `${browserName(connection.browserEvidence||[])} observed ${observed.join(' / ')} · matched by server IP and port`;
  if (connection.protocol === 'UDP' && Number(connection.remotePort) === 443) return 'Possible QUIC / HTTP/3 · encrypted traffic; port alone cannot identify the service';
  if (connection.protocol === 'TCP' && Number(connection.remotePort) === 443) return 'Usually HTTPS / TLS · encrypted traffic; port alone cannot identify the service';
  if (Number(connection.remotePort) === 53) return 'Possible DNS · port alone cannot identify the service';
  return `${connection.protocol || 'Unknown transport'}${connection.remotePort ? ' / port ' + connection.remotePort : ' · no remote peer'}`;
}

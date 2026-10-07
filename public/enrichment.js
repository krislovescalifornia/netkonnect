import {formatEndpoint} from './address.js';
const browserNames={firefox:'Firefox',chrome:'Chrome',edge:'Edge'};
// Shared, escaped presentation of local observations and explicit online results.
export function evidenceDetails(c,{esc},snapshot) {
  const rows=values=>{const present=values.filter(([,v])=>v!==null&&v!==undefined&&v!=='');return present.length?`<dl class="detail-list">${present.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:'';};
  const stamp=value=>new Date(value).toLocaleString();
  const browser=(c.browserEvidence||[]).map(r=>{
    const s=r.security||{};
    return `<div class="evidence-card"><strong>${esc(browserNames[r.source]||'Firefox')} request · ${esc(r.hostname)}</strong>${rows([
      ['Page context',r.site||'Unavailable'],['Observed',stamp(r.seenAt)],['Request kind',r.resourceType],['HTTP version',r.httpVersion],
      ['HTTP response line version',r.responseVersion],
      ['Browser proxy mode',r.proxyMode],
      ['TLS',r.source==='chrome'||r.source==='edge'?'Unavailable through this browser’s standard API':s.protocolVersion],['Cipher',s.cipherSuite],['TLS state',s.state],['Certificate issuer',s.certificateIssuer],['Certificate subject',s.certificateSubject],
      ['Private DNS',typeof s.usedPrivateDns==='boolean'?(s.usedPrivateDns?'Observed':'Not reported for this request'):null],
      ['Encrypted Client Hello',typeof s.usedEch==='boolean'?(s.usedEch?'Observed':'Not reported for this request'):null],
      ['Certificate warnings',[s.isUntrusted&&'Untrusted',s.isDomainMismatch&&'Name mismatch',s.isNotValidAtThisTime&&'Outside validity period'].filter(Boolean).join(', ')||null]
    ])}</div>`;
  }).join('');
  const dns=(c.dnsEvidence||[]).map(r=>`<p class="drawer-copy">Process DNS event · ${esc(r.hostname)} · PID ${r.pid} · ${esc(stamp(r.seenAt))}</p>`).join('');
  const owner=c.owner||{},path=c.networkPath||{};
  const process=rows([['Executable',owner.path],['Product',owner.product],['Publisher metadata',owner.company],['File version',owner.fileVersion],['Process started',owner.startedAt?stamp(owner.startedAt):null],['Parent PID',owner.parentPid],['Windows session',owner.sessionId],['Ownership source',owner.source],['Hosted service candidates',(owner.services||[]).map(s=>`${s.displayName} (${s.name})`).join(', ')]]);
  const transport=rows(Object.entries(c.transportEvents||{}).map(([key,value])=>[key==='retransmittedBytes'?'Retransmitted bytes (separate from usage)':`ETW ${key} events`,value]));
  const routing=rows([['Adapter',path.adapter],['Interface index',path.interfaceIndex],['Matching route',path.destinationPrefix],['Next hop',path.nextHop],['Adapter DNS servers',(path.dnsServers||[]).join(', ')],['Next-hop neighbor',path.neighbor?`${path.neighbor.mac} · ${path.neighbor.state}`:null]]);
  const firewall=(c.firewallEvidence||[]).map(r=>`<p class="drawer-copy">Windows firewall audit · ${esc(r.outcome)} · event ${r.eventId} · ${esc(stamp(r.seenAt))}</p>`).join('');
  const online=c.enhancedLookup;
  const lookup=online?`${rows([['Looked up',stamp(online.lookedUpAt||online.savedAt)],['Reverse DNS',(online.hostnames||[]).join(', ')||'No PTR name returned'],['Registered owner',online.network?.owner],['Registry network',online.network?.name],['Registry handle',online.network?.handle],['Registry range',online.network?`${online.network.startAddress} – ${online.network.endAddress}`:null],['Registry source',online.network?.source]])}<p class="drawer-copy">Reverse DNS and registration identify naming or infrastructure clues. They do not prove the customer service. ${esc((online.errors||[]).join(' · '))}</p>`:'';
  return `<h3>Observed application evidence</h3>${browser||dns?browser+dns:'<p class="drawer-copy">No recent process DNS observation matches this endpoint. Windows cache and local hosts-file clues remain available when observed. Private browser DNS can hide names from Windows.</p>'}
    ${browser?'<p class="drawer-copy">These requests match the browser process, server IP and port within a short time window. Multiple profiles, tabs or sockets can share that endpoint; per-tab bytes are unavailable. A Chromium HTTP response line can be synthesized and does not establish the negotiated HTTP version.</p>':''}
    ${process?'<h3>Process owner</h3>'+process:''}${transport?'<h3>Observed transport events</h3>'+transport:''}${routing?'<h3>Local routing clues</h3>'+routing+'<p class="drawer-copy">This is the local routing table and neighbor cache, not a traced Internet path.</p>':''}
    <h3>Firewall evidence</h3>${firewall||'<p class="drawer-copy">No matching audit record observed. Windows firewall auditing must already be enabled; absence of a record does not mean a connection was allowed or blocked.</p>'}
    <h3>Enhanced Lookup</h3>${lookup||'<p class="drawer-copy">No online result. Local evidence is collected first.</p>'}
    ${snapshot?.enrichment?.enhancedLookup?`<button class="button" data-lookup-address="${esc(c.remoteAddress)}">Look up this IP online</button><p class="drawer-copy">Sends this destination IP to your DNS resolver for PTR and to regional Internet registries for ownership. Results are cached locally for 24 hours.</p>`:'<p class="drawer-copy">Online lookups are off. Enhanced Lookup can be enabled explicitly in Preferences.</p>'}`;
}

export function enrichmentPreferences(settings,esc) {
  const feature=(key,label,copy)=>`<div class="preference-row"><div><strong>${label}</strong><p>${copy}</p></div><button class="switch ${settings[key]?'on':''}" data-enrichment-feature="${key}" data-enabled="${!settings[key]}" role="switch" aria-checked="${!!settings[key]}" aria-label="${label}"><span></span></button></div>`;
  return `<h3>Destination identification</h3>${feature('browser','Firefox integration','Register the local browser bridge. Install the Service Insight add-on in Firefox to provide request hostnames, server IPs, page hostname context and TLS metadata. Private windows are excluded. No page content, full URLs, headers or browsing history are collected.')}
    <button class="button" data-export-firefox>Save Firefox add-on</button><p class="drawer-copy">This development add-on is unsigned. Load it temporarily through Firefox’s about:debugging → This Firefox → Load Temporary Add-on. A signed add-on is required for normal persistent customer installation.</p>
    ${['chrome','edge'].map(key=>`${feature(key,`${browserNames[key]} integration`,'Register this browser’s local bridge. Install its Service Insight extension to provide request hostnames, server IPs, page hostname context and request kinds. Private windows are excluded. TLS, certificate and encrypted DNS details are unavailable through the standard Chromium extension API. No full URLs, headers, page content or browsing history are collected.')}
    <button class="button" data-export-browser="${key}">Save ${browserNames[key]} extension</button><p class="drawer-copy">Extract the ZIP into a folder you will keep. Open ${key}://extensions, enable Developer mode, select Load unpacked, and choose that folder. This development extension persists across browser restarts; store distribution is not configured.</p>`).join('')}
    ${feature('enhancedLookup','Enhanced Lookup','Off by default. Allows an explicit “Look up this IP online” action in connection details. Only that IP is sent to your DNS resolver and Internet registries; no automatic lookups or traffic uploads.')}
    <p class="drawer-copy">${esc(settings.browser||settings.chrome||settings.edge?'Enabled bridges need their matching extension connected.':'All browser bridges are off.')} Passive Windows metadata and bundled network ranges remain local.</p>`;
}

export function evidenceHealth(snapshot,esc) {
  const sources=snapshot?.evidence?.sources||{};
  const labels={'windows-dns-etw':'Process DNS','process-etw':'Process lifetimes','wfp-audit':'Firewall audit',...browserNames};
  const states=Object.entries(labels).map(([key,label])=>{
    const s=sources[key],fresh=s&&Date.now()-s.updatedAt<30000;
    const state=Object.hasOwn(browserNames,key)?(snapshot?.enrichment?.[key==='firefox'?'browser':key]?(fresh&&s.available?'connected':'waiting for extension'):'off'):(s?.available?'listening':s?'unavailable':'starting');
    const tone=['listening','connected'].includes(state)?'ready':state==='off'?'off':'pending';
    return `<div class="source-status-row" title="${esc(s?.message||'No source status yet')}"><dt>${label}</dt><dd class="source-state ${tone}">${state}</dd></div>`;
  });
  const blocked=(snapshot?.evidence?.firewallEvents||[]).filter(r=>r.outcome==='blocked');
  return `<section class="source-status-card" aria-label="Process status"><h3>Process status</h3><dl>${states.join('')}</dl>${blocked.length?`<p>${blocked.length} recent blocked audit endpoint${blocked.length===1?'':'s'}</p>`:''}</section>`;
}

export function sourceDetails(snapshot,esc) {
  const evidence=snapshot?.evidence||{};
  const statuses=Object.entries(evidence.sources||{}).map(([source,s])=>`<p class="drawer-copy"><strong>${esc(source)}</strong> · ${s.available?(Number.isFinite(s.count)?`${s.count} records read`:'listening'):'unavailable'}<br>${esc(s.message)}<br>${esc(new Date(s.updatedAt).toLocaleString())}</p>`).join('');
  const capture=snapshot?.traffic||{};
  const health=[['ETW events lost',capture.eventsLost],['ETW buffers lost',capture.buffersLost],['Collector events dropped at capacity',capture.collectorDropped],['Malformed events skipped',capture.malformedEvents],['Unsupported schema events skipped',capture.unsupportedEvents]].filter(([,value])=>value!==null&&value!==undefined).map(([key,value])=>`${esc(key)}: ${Number(value)||0}`).join(' · ');
  const counters=Object.entries(snapshot?.networkStatistics||{}).map(([family,protocols])=>`<details><summary>${esc(family)} OS protocol counters</summary>${Object.entries(protocols).map(([protocol,values])=>`<p class="drawer-copy"><strong>${esc(protocol.toUpperCase())}</strong><br>${Object.entries(values).map(([key,value])=>`${esc(key)}: ${Number(value)||0}`).join(' · ')}</p>`).join('')}</details>`).join('');
  const requests=(evidence.browserRequests||[]).map(r=>{
    const proxy=r.source!=='firefox'&&(r.proxyMode!=='direct'&&(r.proxyMode!=='system'||snapshot.systemProxy?.known!==true||snapshot.systemProxy.configured!==false));
    return `<p class="drawer-copy"><strong>${esc(browserNames[r.source]||'Firefox')} · ${esc(r.hostname)}</strong><br>${esc(formatEndpoint(r.address,r.port))} · ${esc(r.httpVersion||r.scheme)} · ${esc(r.site||'No page context')}<br>${esc(new Date(r.seenAt).toLocaleTimeString())}${r.proxyMode?` · proxy mode: ${esc(r.proxyMode)}`:''}${r.proxied||proxy?' · proxy configured or uncertain; excluded from socket attribution':''}</p>`;
  }).join('');
  const firewall=(evidence.firewallEvents||[]).map(r=>`<p class="drawer-copy">${esc(r.outcome)} · ${esc(r.protocol)} · PID ${r.pid}<br>${esc(formatEndpoint(r.localAddress,r.localPort))} ↔ ${esc(formatEndpoint(r.address,r.remotePort))}<br>Windows event ${r.eventId} · ${esc(new Date(r.seenAt).toLocaleTimeString())}</p>`).join('');
  return `<h3>Local evidence sources</h3>${statuses||'<p class="drawer-copy">Waiting for source status.</p>'}<p class="drawer-copy">${Number(evidence.records)||0} recent observations · ${Number(evidence.dropped)||0} evicted at capacity. Request and DNS correlation windows expire; this is recent metadata, not a complete browsing history.</p>
    ${health?`<p class="drawer-copy">${health}${capture.addressRefreshAvailable===false?' · Local address refresh unavailable':''}</p>`:''}
    ${counters?`${counters}<p class="drawer-copy">Cumulative OS counters are separate from measured application usage. ICMP counters provide stack activity without per-process or peer attribution.</p>`:''}
    <details><summary>Recent browser observations</summary>${requests||'<p class="drawer-copy">No recent browser requests received. Enable the matching bridge and connect its extension.</p>'}</details>
    <details><summary>Recent firewall audit endpoints</summary>${firewall||'<p class="drawer-copy">No records received. No Windows audit policy is changed automatically.</p>'}</details>`;
}

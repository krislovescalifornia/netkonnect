# Windows network collection audit

Reviewed October 7, 2026. The base collector now gathers broader traffic metadata and local names using Windows APIs, local files and existing caches. TCP/UDP transfer events remain the main source of measured application usage. Complete packet visibility and universal hostname identification are still beyond the implemented collection paths.

The changes below are included in the packaged 1.9.0 installer. Automated regression, package validation and native desktop smoke/setup checks pass. The running installed application and its capture session were left in place; installed acceptance of the new privileged collector remains required.

## Base collection coverage

| Data | Local source | Coverage and qualification |
| --- | --- | --- |
| TCP sockets and listeners | Get-NetTCPConnection, native netstat fallback | IPv4/IPv6 addresses, ports, state and PID. Periodic snapshots can miss brief sockets. |
| UDP bindings | Get-NetUDPEndpoint, independent netstat fallback | Local address, port and PID. Remote UDP peers come from captured transfer events. |
| Measured TCP/UDP transfers | Windows kernel ETW | PID, local/remote tuple, direction, observed bytes, IPv4/IPv6. UDP/443 can indicate possible QUIC, with no service inferred from the port. |
| Brief TCP activity | Kernel connect, accept, disconnect and reconnect events | Visible even with no observed transfer bytes; retained as connection sightings in SQLite. |
| Retransmissions | Kernel TCP retransmit events | Diagnostic event/byte counts, kept separate from application usage. |
| Process identity | Get-Process, Win32_Process and kernel process lifecycle | Name, creation time, available executable/product/version metadata, parent PID and Windows session. Kernel ownership accompanies captured flows when available, including owners that exit between snapshots. Command lines are excluded. |
| Windows service candidates | Win32_Service | Running service names and display names associated with a process. Several services can share one process. |
| DNS names | Existing DNS cache and passive DNS Client ETW | A, AAAA and CNAME evidence, normalized addresses, observed TTL, process DNS correlation and earlier flow clues. Cached IPv4/IPv6 PTR records now contribute names without making reverse queries. |
| Static local names | Local Windows hosts file | All valid IP/name aliases; comments and raw file text do not enter the dashboard snapshot. |
| LAN computer names | Existing NetBIOS cache via nbtstat /c | Unique workstation/server aliases and reported cache lifetime. Group, workgroup and user-name entries are excluded. The text parser requires English type labels. |
| Network adapters | Windows adapter/configuration/statistics tables, .NET fallback | Hidden and virtual interfaces; addresses, IPv6 link-local addresses, IPv4/IPv6 gateways, DNS servers, MAC, link speed, interface index, MTU, metric, DHCP/forwarding state where available, packet/error/discard/byte counters. |
| Local routing and neighbors | Get-NetRoute and Get-NetNeighbor | Longest-prefix route and local next-hop clues, including on-link destination neighbors and incomplete/unreachable neighbor states. This is not an Internet path trace. |
| Protocol activity | .NET IPGlobalProperties | Cumulative OS IPv4/IPv6 TCP, UDP and ICMP counters, including failures, resets, retransmitted segments, discarded datagrams and ICMP messages/errors. ICMP has no implemented per-process/peer attribution. |
| Existing permit/block observations | Security events 5156, 5157 and 5152 | Event-source access and pre-existing Windows audit policy are required. No audit policy is changed. Unsupported protocols, tuples without usable ownership, and older events are outside the implemented correlation. |
| Collection health | Source read status, record counts and capture diagnostics | Empty successful reads are distinct from unavailable sources. ETW events lost, buffers lost, collector capacity loss, malformed events and unsupported schema versions are reported separately in live details. History distinguishes event loss from buffer loss. |

Windows documents TCP lifecycle and retransmission events alongside transfer events, and recommends using the payload PID because network events can originate on other threads. [Microsoft TCP/IP ETW reference](https://learn.microsoft.com/en-us/windows/win32/etw/tcpip).

Process lifecycle tracing exposes process names and parent IDs, while process IDs can be reused. The collector reads selected ownership fields and attaches that lifetime to the flow rather than storing a command line. [Microsoft process ETW schema](https://learn.microsoft.com/en-us/windows/win32/etw/process-typegroup1).

The DNS and NetBIOS additions read information that Windows already holds. They do not cause resolver requests, cache refreshes or remote name-table requests. [Microsoft DNS cache reference](https://learn.microsoft.com/en-us/powershell/module/dnsclient/get-dnsclientcache), [Microsoft nbtstat reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/nbtstat).

## Collection gaps closed

1. **Changing interfaces and group traffic.** Capture previously took its local-address set only at startup and discarded events with neither address in that set. It now refreshes interface addresses each interval, removes IPv6 scope IDs for byte-address comparisons, and uses event direction when a unique local-address match is unavailable. This preserves multicast/broadcast receives, loopback orientation and traffic on newly assigned addresses.
2. **Short-lived ownership and sockets.** Kernel process lifetimes and TCP lifecycle events now accompany transfer collection. Captured ownership takes precedence over a stale snapshot of a reused PID. Lifecycle-only activity remains visible without fabricated usage bytes and is saved independently of eight-second socket snapshots.
3. **Missing local names.** Hosts aliases, cached PTR records and existing unique NetBIOS host names now participate in passive destination naming. Aliases and cache lifetime retain their existing uncertainty rules; local names have a local-name confidence label.
4. **Incomplete adapter visibility.** Hidden/virtual adapters, IPv6 gateways, link-local addresses, packet/discard counters and interface settings are included. Unreadable counters stay unavailable and need a fresh baseline before producing rates. Loopback fallback counters are excluded from aggregate adapter rates.
5. **Silent collection limits.** UDP can fall back independently when its management query fails. Route/neighbor truncation limits were removed. Missing sources, malformed/unsupported transfer schemas and native aggregation capacity loss are visible. ETW buffer losses are separate from event counts, matching their different units. [Microsoft ETW properties](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/ns-evntrace-event_trace_properties).
6. **Compatibility-path evidence.** The developer web server now consumes the same passive DNS/audit evidence instead of discarding those messages.

Executable version metadata is read only from fixed local disks. Browser integrations and Enhanced Lookup remain optional features outside this base coverage.

## Remaining visibility limits

- Kernel TCP/UDP events are transport observations, not a complete link-layer packet feed. ARP, non-IP traffic, tunnels, some stack drops and packets without usable owner metadata cannot be presented as complete per-application traffic. Global ICMP counters add stack activity without identifying an endpoint or owner.
- Private browser DNS, encrypted Client Hello, application-private resolvers and shared CDN addresses can leave hostnames unavailable or ambiguous. Neither an IP nor a Windows cached name proves which website, tab or program received every byte.
- TCP fail events have a different payload schema and are not decoded as endpoint flows. OS failed-connection/reset counters and supported reconnect events provide partial failure visibility.
- DNS events cover the implemented DNS Client completion schema. Query failures, queries without address results and other provider schemas do not become hostname matches. Dedicated periodic DNS-session loss diagnostics remain a useful improvement; traffic-session loss counters do not measure DNS-session completeness.
- Process metadata can be withheld by protected processes or lost before capture observes a lifetime. A service sharing a host PID cannot be positively selected from PID alone.
- The native flow batch is bounded at 20,000 identities; live peers are retained for 30 seconds and bounded separately. Recent evidence is bounded and expires. Reported loss and eviction counts qualify completeness. Detailed history retains the existing 400-day policy.
- Management providers can be unavailable; native/.NET fallbacks cover sockets, adapters and basic DNS clues. Routing, neighbor and service reads currently report unavailability rather than using a second native implementation. The ipconfig DNS fallback also depends on English output and lacks full alias/PTR/TTL coverage.
- Collection still leaves gaps during sleep, sign-out, helper failure or stopped collection. Adapter counters can overlap across virtual interfaces and cannot be used to invent application bytes.

## Further Windows capabilities

The largest remaining extension-free opportunity is Windows Packet Monitor. It is built into Windows and can provide packet/drop visibility across stack components. A production integration would need a metadata-only capture design, duplicate-packet handling across components, session coexistence, resource limits and careful name extraction before its data could safely augment the existing usage model. The current changes do not start Packet Monitor or capture packet payloads. [Microsoft Packet Monitor overview](https://learn.microsoft.com/en-us/windows-server/networking/technologies/pktmon/pktmon).

Other candidates are selected WinHTTP/WinINet and TLS provider events for applications using those Windows stacks, plus IP Helper fallbacks for routing/neighbor tables. These require provider/schema validation and precise process/endpoint correlation. They cannot supply names for every browser or custom network stack. Any HTTP provider integration should extract only permitted hostname/transport fields and exclude URLs, headers, credentials and bodies. [Microsoft WinHTTP overview](https://learn.microsoft.com/en-us/windows/win32/winhttp/about-winhttp).

## Validation

- JavaScript and PowerShell syntax checks pass.
- All 128 automated tests pass. They cover local aliases, PTR parsing, NetBIOS identity filtering/expiry, missing counter baselines, group-address scope, captured PID reuse, zero-byte lifecycle sightings, separate buffer/event loss and SQLite migration/reopening, alongside the existing regression suite.
- Native Windows decoder fixtures cover TCP/UDP, IPv4/IPv6, both transfer directions, multicast/broadcast receives, changing addresses, loopback ports, TCP lifecycle/retransmission events, attached owner lifetimes, unsupported/truncated schemas and aggregation capacity loss.
- The completed collector returned 15 adapters, 123 running service records, 31 routes and 134 neighbors in a normal read outside the filesystem sandbox, with every snapshot source available and no collection issues. That run completed in 5.41 seconds, within the existing 25-second snapshot timeout. These counts are a point-in-time sample.
- Isolated native UI fixtures verify service evidence, browser defaults and the richer adapter fields at desktop/narrow sizes. Unavailable counters remain visibly unavailable and the adapter view has no horizontal overflow.
- Live acceptance of the modified privileged ETW collector remains required. A startup probe reported an existing netKonnect traffic session and insufficient permissions for DNS/Security events in the calling shell. The probe did not recover or stop the existing session. Decoder fixtures do not establish production event delivery or process-schema compatibility under a newly installed helper.

Before releasing a rebuilt installer, verify real process start/end ownership, brief TCP connections, UDP multicast/broadcast, VPN/interface changes, sleep/resume, DNS clues and both loss channels with the installed elevated helper. Preserve the existing offline, setup and installer release gates.

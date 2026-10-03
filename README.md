# netKonnect

A local Windows network observatory with compact transport lanes. Applications connect to service terminals, with separate incoming and outgoing convoys.

## Run

Node.js 20 or later is required. No npm dependencies or build step are needed.

```powershell
npm start
```

Open http://127.0.0.1:4317. The standard connection view works without elevation. To capture actual per-route TCP and UDP byte rates, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-live.ps1
```

Windows displays an Administrator approval prompt. Close an existing detailed-capture instance first. The launcher chooses the next free local port if 4317 is occupied and prints the selected URL; `-Port 4319` chooses a starting port. It launches Node directly with that port and saves its PID in `launcher.pid`. Detailed capture observes network event metadata: owner PID, addresses, ports, direction, and byte counts. It does not collect packet payloads or write ETL traces.

After startup, click **Restart Service** beside the live status on any dashboard or in **Preferences**. The button shows **Restarting…** and reconnects automatically at the same URL. The replacement inherits existing Windows permissions, so an elevated service needs no new Administrator prompt. The old collector releases its trace before the new collector starts. Traffic and observation history reset; browser preferences, sorting, and watchlists remain. Restart is disabled in sample mode or while a restart is underway.

## Live transport

- View all applications, filter by application or destination, and expand the initial ten routes with **Show more routes**.
- Switch between **App to service** and **App to IP / port** for individual destination addresses, ports, and protocols.
- Services default to highest **Total · 60 min** (download + upload bytes), keeping brief speed spikes from reshuffling the list. Click the Application, Service / destination, Total, Download, or Upload column to sort; click again to reverse for lowest usage or reverse alphabetical order. **Sort by** also offers connection count. Your choice is saved in browser preferences.
- Usage includes completed transfers in a rolling 60-minute window, while lane speeds use a smooth average with a 10-second time constant, refreshed from the two-second samples. Brief quiet intervals fade gradually; 20 seconds of sustained idle clears the lane. Connection and route details keep the latest exact sample rates. Departed services remain visible until their usage expires. History starts when capture starts, builds during the first hour, and resets when the server restarts; the collection start time appears while the window is filling. Unavailable usage displays a dash.
- Download vehicles move from the service toward your PC; upload vehicles move in the opposite direction. Vehicle density rises with averaged B/s on a bounded logarithmic scale, so vehicles are a visual encoding rather than one vehicle per packet. Existing vehicles keep their position across display refreshes and sorting. Jumbo jets face their travel direction and leave a fading contrail of bits and byte values.
- Choose automatic transport, bicycles, trucks, or jumbo jets. Automatic transport selects independently for download and upload: bicycles below 64 KB/s, trucks from 64 KB/s to 1 MB/s, and jumbo jets above 1 MB/s. A 20% buffer around those boundaries prevents frequent category changes. Bicycle spokes and truck wheels rotate, and animation/display pause and reduced-motion preferences are respected. Sustained idle routes have no vehicles. When detailed capture is unavailable, route rates remain unavailable instead of estimating bandwidth from connection counts.
- Open a service terminal for aggregate download/upload rates and its individual connections, including per-connection speeds and hostname clues.
- The illustrative sample includes Firefox to YouTube video CDN, Firefox to YouTube TV, and upload-heavy OneDrive traffic. It is always labeled as sample data.

## Other dashboards

Overview includes adapter traffic metrics, recent connections, and application dossiers. Traffic control charts measured adapter rates. Connections provides TCP sockets and UDP endpoints/observed peers, PID, IPs, ports, state, scope, search, filters, details, and CSV export. Little Secrets groups outside connections by application and destination, with a browser-local watchlist. Network adapters displays configuration, cumulative traffic, and packet error counters.

## Collection and interpretation

The Node server binds only to IPv4 loopback and validates Host/Origin. Observation APIs are read-only; restart requires a same-origin POST and a per-instance token. A hidden PowerShell snapshot collector reads Windows connection tables, process names, adapter counters, configuration, and the existing DNS cache about every eight seconds. It falls back to native netstat and .NET network interfaces when management queries are unavailable. Adapter rates come from counter differences; virtual adapters can double-count traffic.

The separate 64-bit Windows ETW collector uses one named system trace session restricted to TCP/IP network events (including UDP). It aggregates observed byte counts into approximately two-second intervals. The server joins these events to socket ownership and cached hostname clues; recent observed peers are retained for 30 seconds and idle speeds are zero. Capture loss is surfaced in the UI, and stale capture clears route rates. The collector stops its trace when the parent server exits. Windows requires Administrator access for this system trace session. If Windows reports an existing session, close the other netKonnect instance rather than stopping an unrelated trace.

UDP/443 peers can reveal QUIC streaming routes that ordinary UDP endpoint tables omit. YouTube-related service labels require matching DNS evidence: googlevideo.com is labeled **YouTube video CDN**, while tv.youtube.com is labeled **YouTube TV**. This cannot establish which video, game, or browser tab is using a connection. DNS cache matches are clues; ambiguous shared IPs retain their IP label. Firefox encrypted DNS may keep names out of the Windows cache, leaving accurate app/IP/port rates but no service name. Service terminals are logical destinations, not geographic headquarters.

PID 0 ownership is unavailable and excluded from application routes. Snapshots can miss short-lived sockets; ETW retains observed transfers between snapshots. First observed means first seen by this server instance. Connection sightings are limited to 24 hours/20,000 entries; history retains 120 adapter samples and resets at restart. Preferences and watchlists remain in browser local storage. Display pause freezes the interface while collection continues. There are no remote assets, analytics, telemetry, or external DNS lookups.

## Validation

```powershell
npm run check
npm test
npm run test:windows
```

Tests cover scope classification, adapter deltas/resets, first-seen tracking, DNS ambiguity, UDP peer enrichment, TCP deduplication, route granularity, idle/stale capture, bandwidth-dependent fleet sizes, elapsed-time smoothing, independent transport categories, threshold stability, and idle/capture/restart resets. Windows decoder tests exercise TCP/UDP and IPv4/IPv6 in both directions using synthetic native event records; they do not require administrator access. Actual ETW capture requires Windows administrator access.

Collector references: [Windows TCP connections](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection), [ETW session permissions](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-starttracea), and [Microsoft kernel network event schemas](https://github.com/microsoft/perfview/blob/main/src/TraceEvent/Parsers/KernelTraceEventParser.cs).

# netKonnect

A local Windows desktop network observatory with an independent tray companion. Applications connect to service terminals, with separate incoming and outgoing convoys. The dashboard can close while collection and local history continue.

Brand colors are white (`#ffffff`) and neon green (`#b6ff00`). The app, tray, and sidebar share one N mark. Run `npm run brand:icons` after changing `scripts/brand.mjs`; packaging regenerates the assets automatically.

## Run

Launch the built **netKonnect-Setup-1.3.1.exe** installer. Installation uses its Windows Administrator approval to set up the background companion, privileged capture helper, sign-in startup and outbound app protection together. There are no customer scripts, terminals, dependency downloads or separate setup switches.

The dashboard's large **Easy Button · Set up everything** performs the same setup if installation could not finish, and repairs or checks it later. A six-stage progress trail follows the real work: companion, checkup, helper, sign-in, live data and local journal. The tiny network crew explains each step, shows elapsed time and calls out Windows approval or live-data waits. Ready/Pending checks update during setup, including in Preferences or with dashboard updates paused. Progress reaches 100% only after fresh observations, measured TCP/UDP capture and a successful local history checkpoint. Windows may ask for Administrator approval to install or repair privileged components. A healthy recheck does not need another approval. Completed steps survive canceled approval; click the same button to retry. Reduced-motion preferences disable the trail and mascot animations.

Version 1.1.1 fixes setup readiness after the companion removes process/DNS maps from its dashboard payload: it now carries explicit evidence that those observations were collected. It also rejects incomplete bundles before collection starts. Unpacked previews have separate companion profiles and explain that persistent setup requires installation in Program Files; they cannot reconnect to the installed companion or register tasks from a user-writable build.

Version 1.1.2 rejects legacy or mismatched companions, recognizes Windows account-name task triggers, and uses firewall evidence from the privileged helper when Windows denies the ordinary app access to the firewall store. Its duplex pipe uses overlapped I/O so waiting for a stop command cannot block traffic intervals. The installed helper can recover netKonnect's reserved trace session after a forced task termination during an upgrade. Ordinary collectors retain conflict checks. Setup errors remain visible during refresh, and privileged capture failures keep their original message.

Version 1.1.3 verifies the named, enabled companion startup entry through Electron's native launch-item API, including its executable and positional `collector` argument. This avoids the app-ID-only `openAtLogin` check, path-with-spaces lookup bug, and omitted switch arguments in Electron 44.5.1. The installer and Easy Button use the same command; manual `--collector` launches remain supported. All seven readiness checkmarks remain available in Preferences after completion. A failed startup write fails at the Sign-in stage instead of waiting on live data.

Version 1.3.0 keeps the completed Easy Button in **Preferences**. Future launches continue checking live readiness; a failed check or lost companion displays a red **!** beside Preferences. Open Preferences and run the Easy Button to repair setup and inspect all seven checks. Search, live network status, Pause/Resume and Restart Service stay in the left navigation. The dashboard displays the release version alongside **kneurons made this for you** and the copyright year recorded for that release.

Traffic speeds default to **Mbit/s** (decimal megabits per second). Click any displayed traffic speed to cycle through Mbit/s, MB/s, KB/s, B/s, Kbit/s, Gbit/s and GB/s. The choice applies to dashboard, route and connection speeds and survives relaunch. Byte speed units use the same 1,024-based scale as usage totals; bit speed units use decimal scales. Data usage totals remain in bytes.

Closing the dashboard leaves collection running in the notification area. **Quit companion** stops collection. Optional switches under **Preferences → Background collection controls** let you disable startup or detailed capture. Sleep, sign-out and stopped collection leave visible gaps. The installer identifies the current desktop owner, while button setup passes the customer's SID through elevation rather than configuring the account used to approve UAC.

The app uses local named pipes, bundled assets, outbound request blocking, and an installer-created Windows Firewall outbound deny rule. No telemetry, online updater, external DNS resolution, or packet upload is implemented. History lives on a fixed local disk at `%LOCALAPPDATA%\netKonnect\data\history.sqlite` with 400-day retention. Data Analytics distinguishes measured capture, snapshots, and gaps, and presents recent adapter/app field notes. History cannot recover time before collection, during sleep/sign-out, or while the companion was stopped. The current installer is unsigned; installed startup, uninstall, and OS-level egress acceptance tests remain release gates.

For development, Node.js 22.13 or later is required:

```powershell
npm install
npm start               # Native desktop window + companion
npm run start:collector # Tray companion only
npm run dist            # Offline x64 Windows installer
```

Development startup controls are disabled. Profiles/history live under `data/desktop/`; existing JSON analytics is imported once. See [desktop architecture and release gates](docs/desktop-architecture.md) for the process, database, security, collection, and visual design.

The original browser server remains a developer compatibility path (`npm run start:web`, then http://127.0.0.1:4317). Persistent one-button setup belongs to the installed desktop app. Detailed capture observes network event metadata: owner PID, addresses, ports, direction, and byte counts. It does not collect packet payloads or write ETL traces.

After startup, click **Restart Service** in the left navigation. The button shows **Restarting…** and reconnects automatically at the same URL. The replacement inherits existing Windows permissions, so an elevated service needs no new Administrator prompt. The old collector releases its trace before the new collector starts. Live rates and rolling route history reset; saved Data Analytics history, browser preferences, sorting, and watchlists remain. Restart is disabled while a restart is underway or the companion is unavailable.

## Release versions

`package.json` is the release version source for Electron, companion identity and installer filenames. Run `npm version <version> --no-git-tag-version` to update it and the lockfile together; the version hook regenerates `public/version.js` for the dashboard. Builds also synchronize that file, and syntax checks reject inconsistent version metadata. Use patch versions for fixes, minor versions for features and major versions for breaking changes. Record release changes in [CHANGELOG.md](CHANGELOG.md), build and verify the installer, then commit and create the matching `v<version>` Git tag.

## Live transport

- Each application appears once in a parent card with combined traffic and 60-minute usage. Click **Show services** to expand its associated services and destinations; **Show endpoints** reveals IP/port/protocol entries in endpoint detail mode. Expanded entries retain their individual traffic, usage, and connection drawers. Expansion stays open across live refreshes and sorting. Local brand logos and consistent names identify apps such as Firefox and Claude; ambiguous DNS destinations retain their IP label. The cards stack their traffic and usage details on smaller screens.
- View all applications, filter by application or destination, and expand the initial ten applications with **Show more applications**. Filters apply to child routes and their parent totals, sorting ranks parents by combined usage, and expanded children follow the selected sort order.
- Switch between **App to service** and **App to IP / port** for individual destination addresses, ports, and protocols.
- Services default to highest **Total · 60 min** (download + upload bytes), keeping brief speed spikes from reshuffling the list. Click the Application, Service / destination, Total, Download, or Upload column to sort; click again to reverse for lowest usage or reverse alphabetical order. **Sort by** also offers connection count. Your choice is saved in browser preferences.
- Usage includes completed transfers in a rolling 60-minute window, while lane speeds use a smooth average with a 10-second time constant, refreshed from the two-second samples. Brief quiet intervals fade gradually; 20 seconds of sustained idle stops new departures; vehicles already traveling finish their journey. Connection and route details keep the latest exact sample rates. Departed services remain visible until their usage expires. History starts when capture starts, builds during the first hour, and resets when the server restarts; the collection start time appears while the window is filling. Unavailable usage displays a dash.
- Download vehicles move from the service toward your PC; upload vehicles move in the opposite direction. Vehicle density rises with averaged B/s on a bounded logarithmic scale, so vehicles are a visual encoding rather than one vehicle per packet. Each vehicle travels once from departure to arrival on an independent animation clock. The same SVG and vehicle nodes survive display refreshes and sorting. Each departure keeps its vehicle type and completes its 12-second journey; averaged traffic changes only the type and spacing of future departures, so jets, trucks, and bicycles can share a lane in order. Jumbo jets face their travel direction and leave a fading contrail of bits and byte values.
- Choose automatic transport, bicycles, trucks, or jumbo jets. Automatic transport selects independently for download and upload: bicycles below 64 KB/s, trucks from 64 KB/s to 1 MB/s, and jumbo jets above 1 MB/s. A 20% buffer around those boundaries prevents frequent category changes. Bicycle spokes and truck wheels rotate, and animation/display pause and reduced-motion preferences are respected. Sustained idle routes empty after their remaining journeys finish. When detailed capture is unavailable, route rates remain unavailable instead of estimating bandwidth from connection counts.
- Open a service terminal for aggregate download/upload rates and its individual connections, including per-connection speeds and hostname clues.
- The illustrative sample includes Firefox to YouTube video CDN, Firefox to YouTube TV, and upload-heavy OneDrive traffic. It is always labeled as sample data.

## Other dashboards

Traffic Management includes adapter traffic metrics, recent connections, and application dossiers. Data Analytics explores saved app and service bandwidth across calendar days, weeks, months, and years. Connections provides TCP sockets and UDP endpoints/observed peers, PID, IPs, ports, state, scope, search, filters, details, and CSV export. Little Secrets groups outside connections by application and destination, with a browser-local watchlist. Network adapters displays configuration, cumulative traffic, and packet error counters.

## Data Analytics

- Compare download/upload trends and stacked application usage over time. Explore a clickable weekday/hour heatmap, busiest hours, weekday totals, busiest calendar day, and app/service rankings. Totals and every chart reflect the same matching records.
- Search names, services, IPs, hostnames, or process IDs. A search such as **Firefox used more than 1GB on a Tuesday in October** becomes visible weekday, month, and byte filters. This is a limited deterministic search grammar, not an AI query engine. Use the advanced filters for dates, application, service, weekday, month, year, hour, direction, TCP/UDP, scope, strict minimum/maximum bytes, and result order. Month/year searches cover all searchable history unless you specify dates.
- Thresholds apply to combined matching service bytes **per application per calendar day**, or **per application per hour** when selected. More than 1 GB excludes exactly 1 GB. GB means 1,024³ bytes. Calendar dates use the browser timezone, including daylight-saving changes; repeated fall-back hours remain separate hourly results.
- Select any application or service in the rankings to explore its history, related destinations/apps, observed process IDs, protocols, ports, scopes, first/last observations, IP addresses, and DNS clues. Explicit app/service filters also show these details. Back to results restores the original filters. Paginated results show 50 records; CSV exports all matches, including download/upload bytes and timezone.
- The desktop companion checkpoints measured bytes/coverage to SQLite every 15 seconds and at orderly shutdown, while persisting ordinary adapter/connection observations independently. It prunes history older than 400 days. The following storage details apply to the optional browser server: detailed Windows capture saves measured hourly app/service/endpoint/owner/protocol/scope aggregates to local daily JSON files in `data/analytics/` every 15 seconds and on orderly shutdown. History survives restarts; an abrupt exit can lose the latest unflushed intervals. Only the latest 400 days are loaded for search; older daily files remain on disk. This directory is ignored by Git. No prior traffic can be recovered: history builds from capture after this feature is started, and requires Administrator capture. Missing capture periods and event loss can make totals incomplete. Adapter counts are never substituted for app usage.
- Hourly records use the collector interval's ending hour (approximately two-second precision at boundaries). Each hourly aggregate retains up to 64 values per metadata category. Process IDs may be reused; historical ownership is not retroactively reassigned. Unresolved processes retain their observed process/PID label. DNS matches remain clues, and unknown or ambiguous destinations retain their IP identity.
- Sample mode has a clearly labeled, deterministic year of illustrative traffic to explore longer-term charts and queries. It is never written to the live history store. Analytics refreshes about every 30 seconds and preserves filter drafts while you edit.

## Collection and interpretation

The optional Node server binds only to IPv4 loopback and validates Host/Origin. Observation APIs are read-only; restart requires a same-origin POST and a per-instance token. A hidden PowerShell snapshot collector reads Windows connection tables, process names, adapter counters, configuration, and the existing DNS cache about every eight seconds. It falls back to native netstat and .NET network interfaces when management queries are unavailable. Adapter rates come from counter differences; virtual adapters can double-count traffic.

The separate 64-bit Windows ETW collector uses one named system trace session restricted to TCP/IP network events (including UDP). It aggregates observed byte counts into approximately two-second intervals. The server joins these events to socket ownership and cached hostname clues; recent observed peers are retained for 30 seconds and idle speeds are zero. Capture loss is surfaced in the UI, and stale capture clears route rates. The collector stops its trace when the parent server exits. Windows requires Administrator access for this system trace session. If Windows reports an existing session, close the other netKonnect instance rather than stopping an unrelated trace.

UDP/443 peers can reveal QUIC streaming routes that ordinary UDP endpoint tables omit. YouTube-related service labels require matching DNS evidence: googlevideo.com is labeled **YouTube video CDN**, while tv.youtube.com is labeled **YouTube TV**. This cannot establish which video, game, or browser tab is using a connection. DNS cache matches are clues; ambiguous shared IPs retain their IP label. Firefox encrypted DNS may keep names out of the Windows cache, leaving accurate app/IP/port rates but no service name. Service terminals are logical destinations, not geographic headquarters.

PID 0 ownership is unavailable and excluded from application routes. Snapshots can miss short-lived sockets; ETW retains observed transfers between snapshots. First observed means first seen by this server instance. Connection sightings are limited to 24 hours/20,000 entries; the live adapter chart retains 120 samples and resets at restart. Measured analytics history is persisted separately. Preferences, speed units and watchlists remain in browser local storage. Display pause freezes the interface while collection continues. There are no remote assets, remote telemetry, or external DNS lookups.

## Validation

```powershell
npm run check
npm test
npm run test:windows
npm run test:desktop
npm run test:release # Recheck the latest packaged build
npm run test:installed # Close the installed dashboard first; verify real setup and the sign-in launch command
```

`npm run pack` and `npm run dist` run syntax checks, all automated tests, the Windows decoder cases, package asset validation, and native packaged-window QA before updating `dist/latest-build.json`. Every build has a new timestamped directory under `dist/`, so rebuilding cannot delete resources from an older running app. The manifest identifies the verified installer/unpacked app. QA screenshots and results live under `test-results/release-*`, outside the shipped bundle.

The native QA clicks the real Easy Button through cancellation, retry, all six stages and a healthy recheck, including progress in a paused Preferences drawer. Its snapshots, named-pipe IPC and SQLite checkpoint are real; Windows task registration, firewall changes, UAC cancellation and measured-capture readiness use explicit test fixtures. Actual installed UAC, sign-in/reboot and uninstall acceptance remain required before production distribution.

Installed acceptance uses the actual Program Files executable and customer profile, clicks Easy Button through the production bridge without fixtures, and requires seven checked rows and 100% completion. It verifies service restart, repeated fresh traffic intervals, local history checkpoints, and launching the actual enabled sign-in command with the dashboard closed. Screenshots and native startup evidence are saved under `test-results/installed-*`. This command exercises the sign-in command without signing the customer out; reboot/sign-out acceptance is separate.

Tests cover persistent analytics reloads, app/day thresholds across services, calendar and DST filters, consistent chart totals, historical PID ownership, API pagination, safe full CSV exports, scope classification, adapter deltas/resets, first-seen tracking, DNS ambiguity, UDP peer enrichment, TCP deduplication, route granularity, idle/stale capture, bandwidth-dependent fleet sizes, elapsed-time smoothing, independent transport categories, threshold stability, idle/capture/restart resets, complete journeys across two-second refreshes, mixed vehicle sequences, departure scheduling, and draining idle lanes. Windows decoder tests exercise TCP/UDP and IPv4/IPv6 in both directions using synthetic native event records; they do not require administrator access. Actual ETW capture requires Windows administrator access.

Collector references: [Windows TCP connections](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection), [ETW session permissions](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-starttracea), and [Microsoft kernel network event schemas](https://github.com/microsoft/perfview/blob/main/src/TraceEvent/Parsers/KernelTraceEventParser.cs).

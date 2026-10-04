# netKonnect desktop architecture

The desktop implementation has three parts: a sandboxed Electron dashboard, an independent tray companion, and a privileged ETW helper. Installation prepares collection together; one Easy Button checks or repairs it afterward. Closing the dashboard exits its process while the companion keeps recording. Existing transport lanes, application dossiers, heatmaps, rankings, calendar search, and CSV exports run inside the native window.

## Process and privilege boundaries

```text
netKonnect.exe                       netKonnect.exe --collector
  sandboxed local renderer            tray / collection supervisor
  narrow preload bridge               Windows snapshots every ~8 seconds
  netkonnect:// bundled assets <IPC>   SQLite journal and query engine
                                             ^
                                             | authenticated local pipe
                                    Windows SYSTEM capture task
                                      protected PowerShell bootstrap
                                      C# ETW metadata collector
```

The dashboard and companion have distinct single-instance locks and profiles. Opening the dashboard starts or reconnects to the companion. The tray opens the dashboard and has an explicit **Quit companion (stop collecting)** command. The desktop has no HTTP listener or localhost API. Local named pipes use unpredictable names, 256-bit per-instance capabilities, bounded requests/responses, and timeouts. Only the trusted top-level local renderer frame can use the narrow bridge; it has no generic shell, filesystem, or IPC capability.

The installer automatically calls the bundled setup using its existing elevation. It identifies the owner of Explorer in its Windows session, resolves the customer's local journal path and SID, registers **netKonnect Detailed Capture <SID>**, enables companion sign-in startup and starts the helper immediately. If it cannot identify one desktop owner (for example a deployment without Explorer), the dashboard presents the Easy Button to finish setup for the current account. Silent installs follow the same rule. No scripts or manual helper installation are exposed to customers.

The Easy Button starts/reconnects the companion, repairs missing or incorrect task/firewall configuration through one UAC operation, enables startup and waits up to 45 seconds after configuration for fresh snapshots, active measured capture and healthy history storage. It verifies a SQLite checkpoint before reporting success. Duplicate clicks share one operation. Healthy rechecks and starting an installed idle helper avoid additional elevation; partial success survives cancellation. Setup status checks the task's actual protected action, identity and enabled logon trigger, rather than just its name. Preferences retain opt-out controls inside a collapsed background-controls section. Turning ordinary startup off also removes detailed startup capture with Windows approval.

The helper runs as SYSTEM with service-account logon and boot/customer-sign-in triggers, so capture does not depend on an interactive administrator session or stored credentials. The task ACL gives the customer read/execute access without permission to edit its privileged action. The renderer has only fixed setup/status IPC methods, with no generic privileged shell capability. The helper has no dashboard and never receives commands, script paths, or network destinations from the renderer.

The per-machine installer uses a fixed Program Files destination: a persistent elevated task must not execute source from a user-writable installation. Setup validates the customer's profile directory. The helper validates the companion executable and its owner SID, pipe syntax, capability and local data disk, and loads C# only from the protected installation. Button setup obtains the customer's SID before elevation, including approval with another account. Profile paths currently require the standard local AppData location on a fixed disk. Tasks are per-user but ETW still uses one system-wide named session; simultaneous multi-user capture needs further design and acceptance testing. No conflicting trace is forcibly stopped.

## SQLite and durability

SQLite is embedded through Node's built-in module, with WAL, FULL synchronous checkpoints, one writer, and no extension loading. It needs no database server or native npm database binding. Installed data lives at `%LOCALAPPDATA%\netKonnect\data\history.sqlite`; fixed-disk validation excludes UNC shares and redirected roaming storage. Development profiles/history live under `data/desktop/`.

| Table | Evidence |
| --- | --- |
| `hourly_usage` | Measured app/service/IP/port/PID/protocol/scope aggregates; indexed by time, app/time, service/time |
| `coverage` | Observed ETW seconds per hour |
| `observation_minutes` | Snapshot/measured coverage and event loss deltas |
| `adapter_minutes` | Sampled adapter download/upload estimates and error counters |
| `connection_sightings` | Daily app/owner/local/remote/protocol identities, first/last sightings, metadata |
| `legacy_imports`, `migrations` | Idempotent JSON imports and initial schema version |

Measured bytes and capture coverage checkpoint together every 15 seconds and at orderly shutdown. Failures roll back and retain dirty data for retry. A hard crash can lose the last 15 seconds plus the in-flight ETW interval. Ordinary observations checkpoint independently. The recent-week journal distinguishes measured traffic, snapshots, event loss, and collection gaps. Background field notes present adapter activity and apps/destinations seen while the window was closed, independently of measured-traffic search filters.

Persisted observations older than 400 days are pruned during successful collection. The existing timezone/DST-aware analytics engine currently loads up to 400 days of hourly usage into memory. Rich metadata is stored as JSON alongside indexed identity columns. The next database iteration should push range filtering, totals, rankings, and pagination into SQL in a query worker; normalize process-lifetime identities; add schema upgrade transactions/backups; and benchmark high endpoint cardinality. SQLite remains the recommended database.

Development imports existing `data/analytics/YYYY-MM-DD.json` files once without modifying them. Installed builds do not scan arbitrary disks or infer a source checkout. A user-directed legacy import picker remains future work. Browser preferences are separate from the desktop profile.

## Passive network hooks

| Hook | Current evidence | Limits |
| --- | --- | --- |
| Windows TCP/UDP tables | Process ownership, addresses, ports, socket state | Sampling misses brief sockets; UDP tables alone omit peers |
| TCP/IP kernel ETW | Direction and measured TCP/UDP bytes, IPv4/IPv6 peers, including UDP/443 | Administrator permission, event loss, ownership races |
| Adapter counters | Overall rates, cumulative bytes/errors, configuration | Virtual interfaces can double-count; never used as app bytes |
| Existing Windows DNS cache | Cached hostname clues | Shared IPs/encrypted DNS limit attribution |

No active DNS resolution, destination probes, online geolocation, remote icons, packet payload inspection, or packet driver is used. Connection counts never become fabricated byte counts. These hooks cannot establish browser tabs, exact videos, HTTP URLs, request bodies, or decrypted TLS contents.

For the next native collector, consolidate PowerShell snapshots using Windows IP Helper APIs (`GetExtendedTcpTable`, `GetExtendedUdpTable`, adapter address/counter APIs) and process start/stop ETW. PID plus creation time improves short-lived-process attribution and prevents recycled-PID ambiguity. Optional passive DNS Client ETW and WFP connection/drop events can add name clues and firewall outcomes after schema/permission validation. Start with read-only subscriptions; a packet driver adds unnecessary signing, security, performance, and maintenance cost for this observatory.

## Offline enforcement

1. Bundled assets load from `netkonnect://app`, with `connect-src 'none'`, renderer sandboxing, context isolation, denied browser permissions, disabled Node/webviews, denied external navigation/windows, and no remote content.
2. Session interception blocks non-local asset requests. Chromium background networking, component updates, pings, sync, DNS resolution, and direct WebRTC UDP are disabled. No updater, crash-upload initializer, telemetry client, or external-link launcher exists.
3. Desktop Node guards deny HTTP/HTTPS, TLS, UDP, DNS, global fetch, TCP connections/listeners, and remote named pipes. Only the local netKonnect pipe family is permitted.
4. The installer adds a Windows Firewall outbound deny rule for installed `netKonnect.exe`, covering dashboard, companion, and Chromium children. Installation aborts if rule creation fails. Windows Firewall must remain enabled; administrators can alter it. PowerShell helpers are passive collectors, not remote request executors.
5. Data stays on a fixed local disk. Uninstall removes startup, the capture task, and the firewall rule while preserving the user's journal.

Dependency downloads and packaging are build-time operations. The shipped app does not download dependencies or updates. Distribute releases manually as signed offline installers.

## Verification and release gates

Version 1.1.2 checks the companion's protocol, bundle root and app version before connecting. This prevents a legacy preview sharing the installed profile from supplying stale observations. Task readiness resolves account-name triggers back to SIDs. When firewall queries are denied to the desktop account, the authenticated installed SYSTEM capture stream supplies rule evidence; the evidence becomes unavailable when that stream disconnects. The duplex pipe uses overlapped I/O so its waiting control read cannot serialize traffic writes. A Windows regression test runs the production session script with fake ETW/OS identities and requires three intervals before sending stop. Only this installed helper requests recovery of the exact reserved `netKonnect network traffic` ETW session after an upgrade forcibly terminates its predecessor. Basic collectors still surface conflicts. Automatic status refreshes preserve setup errors.

The 1.1.1 Easy Button fix carries process/DNS readiness evidence alongside the decorated snapshot, which intentionally omits those raw maps. Setup checks use that evidence with snapshot freshness and live capture; they cannot mistake the smaller IPC payload for missing observations. Native QA exercises this actual companion payload, SQLite checkpoint and sandboxed button bridge, with OS setup/elevation and capture readiness replaced by explicit fixtures. Progress streams from the main process through a narrow preload subscription: six actual work stages, elapsed time, updated checks, approval/live-data wait explanations, recoverable failure and checkpoint-verified completion. The UI updates even with the dashboard paused or Preferences open. A later failed live check clears the prior completion display.

Build commands now use unique timestamped output directories, leaving running builds intact. Unpacked previews and installed apps use distinct companion profiles; only a protected Program Files installation exposes persistent setup. JavaScript/PowerShell syntax, automated tests, Windows decoder cases, required package assets and native packaged-window QA must pass before `dist/latest-build.json` identifies a build as verified. QA profiles, history and screenshots live outside the shipped app. This gate includes cancellation/retry, every progress stage, a paused Preferences drawer and healthy rechecks. It does not replace the installed Windows acceptance checks below.

Verified: automated tests including setup cancellation/retry, duplicate clicks, live readiness, idle helper startup, checkpoint failure and stale capture; mocked Windows task configuration with separate customer/admin identities and mismatched-task rejection; JavaScript/PowerShell syntax; eight synthetic Windows TCP/UDP/IPv4/IPv6 decoder cases; native-window loading and real snapshots; bridge/Easy Button/preferences/seven-day journal rendering and screenshots; renderer and Node request blocking; SQLite rollback/reload/import behavior; x64 NSIS compilation. Existing unrelated trace sessions were left untouched; conflicts are surfaced. The Windows setup tests mock OS mutations and do not substitute for installed task/UAC acceptance tests.

Before production release:

The 1.1.2 acceptance report incorrectly inferred startup readiness from the Run value rather than the app's native startup result. Its measured capture, restart and SQLite evidence remained valid, but the seven-check completion claim was invalid. Version 1.1.3 replaces that verification with an installed UI acceptance path using the production settings and bridge, screenshots of all seven visible checkmarks, service restart, fresh interval stability and the enabled sign-in command launch with the dashboard closed. Native startup tests use disposable Run entries and verify named entries, Program Files paths, approval disable/enable and removal. Reboot, uninstall, other-account approval and broader egress acceptance remain separate.

On the current host, 1.1.3 passed that installed acceptance twice around a full companion shutdown and launch from its enabled startup entry. Both runs showed seven checked rows and 100% completion through the actual renderer bridge, fresh measured intervals, recovered service restart and successful history checkpoints. The runtime hashes matched the release. Evidence and screenshots are in `test-results/installed-2026-10-04T01-16-09-764Z`; `test-results/installed-acceptance.json` now contains that corrected report. All 79 automated tests and packaged-window QA passed. The startup command was executed with the dashboard closed; an actual sign-out/reboot was not performed.

- Broader install/uninstall/upgrade acceptance tests, cancellation/retry, standard users approving with a different administrator, Windows Startup Apps overrides, sign-out/reboot/resume, battery operation, capture enable/disable UAC, task ACL/read/execute access, task cleanup and crash recovery. The current host's silent upgrade and immediate installed collection were verified.
- Independent process-attributed egress monitoring after installation, including long idle/use periods, IPv4/IPv6, proxy/PAC, WebRTC, and renderer compromise. Software request-blocking tests are not a complete OS-level audit.
- Executable/installer signing. The current build is unsigned.
- A small signed native helper/service with explicit local-only pipe ACLs, per-user identity, request rate limits, and process-lifetime checks. Current IPC bounds frame sizes/connections and authenticates the trace stream's installed helper.
- History deletion/retention controls, consistent backup/export, legacy import, offline signature evidence, and SQL-backed historical adapter/connection drill-downs.
- Long-workload CPU/RAM/I/O measurements, fewer snapshot process launches, endpoint-cardinality limits, and 400-day stress tests.

The visual direction is a calm lime/cream observatory with compact transport lanes and small field-journal details. Next useful visuals are historical destination lifetimes, app comparisons, explainable local baseline deviations, and day/hour drill-downs with coverage overlays. Geography or suspiciousness scores need evidence rather than invented certainty.

## Primary references

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [custom protocols](https://www.electronjs.org/docs/latest/api/protocol), [request interception](https://www.electronjs.org/docs/latest/api/web-request)
- [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [NSIS customization](https://www.electron.build/docs/nsis/)
- [Microsoft ETW](https://learn.microsoft.com/en-us/windows/win32/etw/about-event-tracing), [Windows task principals](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal)

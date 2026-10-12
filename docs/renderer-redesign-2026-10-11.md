# Canvas city renderer — October 11, 2026

The dense desktop fixture fell from **1.55 to 0.34 occupied CPU cores (78%)**;
compact view fell from **0.91 to 0.27 cores (70%)**. The renderer now paints
the existing watercolor city on one canvas per card, with cached scenery and
30 FPS activity. People, builders, machinery, cranes, transit and deliveries
remain animated. Version **1.17.3** was subsequently built, installed and checked
with the real local profile. Its installed-app measurements follow below.

## Installed application validation

Source commit `bbeadf6` and release tag `v1.17.3` were pushed to `origin`.
The release build passed 183 tests, syntax checks, native ETW and icon checks,
SVG reference checks, canvas pixel checks and the packaged desktop smoke/setup
tests. The installer completed successfully on October 11, 2026. Hash checks
confirmed that the installed renderer, collector, worker, database code and
package metadata match the verified build. Installer SHA-256:
`42529e8fff056e45d2713b003d9153efdfa86d20c29a8887da40bdb23d593624`.

The real installed acceptance test passed all seven readiness checks, restart
recovery, collection with the dashboard closed, and launch through the actual
configured sign-in command. It confirmed version 1.17.3, ten canvas cities and
three visibly painted canvases in the 1444 × 941 dashboard viewport. This did
not simulate a Windows sign-out or reboot. The app was reopened normally and
left visible after acceptance.

Windows process counters sampled the visible 1.17.2 installation for 20.14
seconds before upgrading. After installation and acceptance, the normal
1.17.3 dashboard warmed up for 20 seconds, followed by two independent samples
of approximately 20.14 seconds each. These use actual traffic and saved cities,
not the synthetic level-15 performance fixture.

| Installed measurement | 1.17.2 before | 1.17.3 sample 1 | 1.17.3 sample 2 |
| --- | ---: | ---: | ---: |
| Measured process-tree CPU, occupied cores | 1.642 | 0.400 | 0.487 |
| Share of this 16-thread machine's CPU | 10.26% | 2.50% | 3.04% |
| Dashboard renderer CPU, cores | 1.168 | 0.199 | 0.237 |
| Dashboard GPU-process CPU, cores | 0.328 | 0.099 | 0.113 |
| Companion main CPU, cores | 0.050 | 0.022 | 0.033 |
| Persistent snapshot worker CPU, cores | Not captured | 0.021 | 0.046 |
| Dashboard 3D GPU engine busy | 0.601% | 0.614% | 0.564% |
| Measured process-tree private working set, MiB | 921.0 | 858.0 | 816.1 |

Measured CPU fell **70–76%**, averaging about **73%**, with GPU engine activity
roughly unchanged. The CPU totals include the dashboard, companion, their
Chromium children and descendants present at both sampling endpoints. The new
persistent snapshot worker is included; the old short-lived snapshot processes
were not captured by this method. Privileged capture helpers and WMI provider
work are excluded. Thus this is a conservative operational comparison of the
measured process tree, not a complete machine-energy measurement or identical
replayed traffic. Changing real traffic and window visibility affect results.

A checkpointed, closed 502,390,784-byte history backup passed SQLite's quick
check before installation. After upgrading, all 6,788 existing lifetime city
records remained, none had reduced measured totals, and three new records had
been observed. The companion reported available measured traffic with no
collector or storage error.

Local evidence: `test-results/performance/installed-1.17.2-visible.json`,
`installed-1.17.3-visible-1.json`, `installed-1.17.3-visible-2.json`, and
`installed-1.17.3-history.json`; installation receipt at
`test-results/installation-1.17.3.json`; installed acceptance and screenshot at
`test-results/installed-2026-10-11T18-01-47-299Z/`. The two raw after samples label
the worker `powershell.exe`; the profiler's role matcher was subsequently
corrected to recognize the actual `-Persistent` worker argument. CPU values
were unaffected.

## Measurement

An occupied core is the sum of Electron process CPU seconds divided by elapsed
wall seconds, not a whole-machine Task Manager percentage. Runs used the same
hardware-accelerated Electron fixture, sequentially, with ten high-density
level-15 cities, two-second illustrative traffic polls, and the same artwork
and activity populations. Three cities were visible at 1440 × 1100 and two at
900 × 700. Each foreground sample lasted approximately 10.5 seconds.

| Scenario | Original SVG | SVG repeat | Final canvas |
| --- | ---: | ---: | ---: |
| Desktop, occupied CPU cores | 1.554 | 1.474 | 0.342 |
| Compact, occupied CPU cores | 0.906 | 0.812 | 0.272 |
| Paused compact, occupied CPU cores | 0.118 | 0.066 | 0.019 |
| Desktop renderer CPU cores | 1.176 | 1.126 | 0.212 |
| Desktop GPU-process CPU cores | 0.377 | 0.344 | 0.126 |
| Desktop compositor layers | 274 | 274 | 13 |
| Desktop renderer working set, MiB | 421.9 | 421.1 | 421.2 |
| Compact renderer working set, MiB | 419.0 | 439.0 | 463.3 |
| Desktop city draws/second | 59.9 | 60.3 | 30.1 |

Against the repeated SVG baseline, the reductions were 77% desktop and 66%
compact. Intermediate canvas runs were 0.37–0.40 desktop cores before tighter
cache invalidation. This is a substantial reduction, but visible dense cities
still have a meaningful cost.

Both renderers kept the UI frame probe's 95th percentile near 16.8 ms. The city
itself deliberately paints at 30 FPS; the 60 FPS probe is not a city FPS claim.
The final desktop sample had no long tasks. Compact had one 230 ms long task
and a 217 ms frame gap. This redesign does not eliminate all UI stalls.

Paused and minimized states produced zero city draws; minimized also produced
zero display polls and frame callbacks. Short minimized samples varied from
0.001 to 0.053 cores, with renderer housekeeping and a large working-set drop
in later runs. There is no claim that the final minimized sample improved:
its 0.053 cores was higher than the repeated SVG sample's 0.036 cores.

Windows GPU engine counters were sampled separately for ten seconds at desktop
size. The 3D engine rose from **0.554% busy with SVG to 0.817% with canvas**;
the copy engine fell from 0.0074% to 0.0032%. Other reported engines were idle.
Canvas shifts more drawing onto the GPU while sharply reducing CPU-side SVG
work. These are separate engine counters, not additive device utilization.
The secondary Windows process-counter sample also showed lower application
CPU, about 1.73 to 0.55 cores, excluding the measurement helper. It covers a
different interval and is not mixed into the Electron table above.

The fixture excludes real collectors. No battery-life, power, GPU memory,
multi-day stability or low-end/software-rendering result is claimed. Compact
renderer memory increased by roughly 24–44 MiB versus the two SVG samples.

## Implementation

- `public/city-canvas.js` compiles the authored SVG scene into retained drawing
  records. It caches paths, transforms, styles and image handles rather than
  walking DOM geometry or resolving CSS every frame. Static architecture,
  terrain and infrastructure use raster caches. Sprite sheets are cropped at
  the source. The shared image lookup is bounded.
- The SVG remains the measured-growth and layout model, with its accessible
  city description. Its internal artwork is excluded from SVG painting and
  native CSS animation. A canvas inside the scene paints the same assets in
  the same order, including clipping, foundations, lighting and deliveries.
- `TransportAnimator` retains journey queues and sky schedules. Paints are
  capped at 30 FPS; the logical journey clock still advances independently.
  Residents use that clock, while construction uses a clock that stops without
  incoming work. Polls, tier changes, sorting and resizing retain the painter
  and actor records. Source changes reset the paint cadence as well as journeys.
- Offscreen cards skip drawing. Removed cards disconnect observers and release
  their drawing surface. Asset loads coalesce repaint requests. Pause, motion
  disabled, reduced motion and hidden windows stop the logical motion clock.
- The legacy SVG path remains available with `?renderer=svg` for comparison.
  The new module is included in desktop bundle validation and the local HTTP
  asset allowlist. No new illustration or synthetic city-growth source was added.

This painter implements the scene's existing SVG subset, not arbitrary SVG.
Future artwork geometry or CSS animation additions must be reflected in the
painter and its rendered checks. Native SVG animation objects are no longer
the canvas renderer's clock.

## Verification

Passed: 183 tests, JavaScript and PowerShell syntax checks, the native desktop
smoke test, and `npm run test:renderer`.

The rendered test isolates actual pixels for residents, machinery, builders,
haulers and delivered crane loads. Residents move across at least three city
quarters at desktop, compact and mobile sizes. It verifies:

- Original artwork paints at all twenty tiers, retaining the same painter.
- Measured construction changes the painted result, including while paused.
- Pause, motion disabled and emulated OS reduced motion freeze the pixels.
- Residents continue while the work clock and measured growth remain stopped.
- Polling, sorting, resizing and offscreen scrolling preserve live scenes.
- Day/night lighting, delivery visibility and construction clips remain visible.

Screenshots were visually inspected, including compact activity and the final
city tier. Raw reports and images are local under `test-results/performance/`
(`renderer-before`, `renderer-svg-repeat`, `renderer-final`, with corresponding
GPU reports) and `test-results/canvas-renderer/` (`results.json` and screenshots).

```powershell
npm run test:performance -- --svg --label=svg --gpu-counters
npm run test:performance -- --label=canvas --gpu-counters
npm run test:renderer
npm test
npm run check
npm run test:desktop
```

Run profiles sequentially. The Windows Electron checks need execution outside
the Codex process sandbox on this machine because of the existing executable
ACL restriction; no ACLs were changed. `qa-city-vibrancy.mjs` still tests the
legacy SVG reference explicitly; the default canvas has its own pixel checks.

## Restored distant backgrounds

The existing twenty watercolor panoramas now sit behind the modular live city.
The panorama and ground share one raster cache, replacing the former ground-only
cache without adding a per-frame scenery draw or compositor layer. Measured
tier changes, resize and lighting invalidate it; ordinary motion reuses it.
Idle/capture labels sit above App Info, whose caret has a fixed padded area.

Sequential hardware-accelerated checks used the same ten-city fixture:

| Measurement | Before / repeated original | After / repeated after |
| --- | --- | --- |
| Desktop occupied CPU cores | 0.377 / 0.364 | 0.382 / 0.371 |
| Compact occupied CPU cores | 0.283 / 0.304 | 0.315 / 0.310 |
| 3D GPU engine busy | 0.835% / 0.827% | 0.849% / 0.845% |
| Compositor layers | 13 / 13 | 13 / 13 |
| Paused / minimized city draws | 0 / 0 | 0 / 0 |

The repeated original also exhibited the compact long task (217 ms maximum
frame interval, versus 233 ms after); the first original run did not. Repeated
CPU differs by about 2%, with GPU engine busy differing by 0.018 percentage
points. These short samples support comparable rendering cost, not a guarantee
of identical resource use. Artwork decoding still has a load-time cost.
Evidence: `test-results/performance/background-{before,baseline-repeat,after,repeat}`
JSON reports, GPU reports and desktop screenshots. The baseline fixture now
includes the original `city-canvas.js` when comparing against HEAD.

Canvas QA passed actual resident, machine, builder, hauler and crane motion;
measured growth; pause and reduced motion; sorting, resizing and offscreen
continuity; all twenty background sources and their painted coverage/cache
reuse. Desktop, compact and phone screenshots verify the footer and caret.

## Traffic stutter audit and correction

The subsequent traffic audit supersedes the 30 FPS recommendation above. The
city now paints on each display frame (60 Hz on this test machine), while
retaining the journey clock, offscreen culling and static scenery caches.
These changes were subsequently built into the verified 1.17.4 installer.
The running 1.17.3 installation has not been replaced; the installer is provided
for the user's visual acceptance test.

The original ten-city synthetic fixture did not reproduce the reported polling
hitch. A local snapshot contained 327 connections, 1,197 recent usage records
and 6,792 lifetime records. A live collector run reproduced 63 ms and 75 ms
main-thread tasks and a 66.7 ms browser frame gap. Profiling identified scene
style refreshes during transport changes, rather than journey clock resets.

The causes and corrections are:

- Polling stripped the SVG's layout-owned palette style. A transport change
  restored it, repeatedly resolving computed styles throughout the city.
  Polling now preserves layout-owned scene styles.
- The layout signature included individual vehicle types. Switching between
  two trucks rebuilt road scenery, atmosphere and actor layout. The signature
  now uses transport modes: road, rail, air and water. Actual corridor changes,
  city tiers and viewport sizes still update the layout.
- Working/resting and terminal activity classes caused broad style refreshes.
  The painter handles their visual effects and clocks directly. Other style
  changes are coalesced by subtree, and metadata does not invalidate artwork.
- The deliberate 30 FPS cap made traffic visibly step between frames. It is
  removed, and active polling updates are painted on the next display frame
  instead of inserting an extra paint between animation frames.

A repeatable stress run replayed the local snapshot while switching pickup
and semi traffic every two seconds. The baseline uses HEAD's 1.17.3 renderer;
the result also preserves the previously uncommitted restored backgrounds.
Each active measurement lasted approximately 10.5 seconds with five polls.

| Actual city paint measurement | Baseline desktop | Fixed desktop | Fixed compact |
| --- | ---: | ---: | ---: |
| Median interval, ms | 33.3 | 16.7 | 16.7 |
| 95th percentile, ms | 48.7 | 16.8 | 16.8 |
| Worst interval, ms | 153.6 | 28.9 | 28.9 |
| Paint gaps over 50 ms | 14 | 0 | 0 |
| Main-thread long tasks | 9 | 0 | 0 |
| Whole-city style refreshes | 90 | 0 | 0 |
| Occupied CPU cores, Electron process tree | 0.452 | 0.534 | 0.435 |

The smoother cadence costs about 18% more CPU than this stuttering baseline;
it doubles the regular paint frequency. The fixed process-tree CPU is about
3.3% of this machine's 16 logical processors. GPU-process CPU rose from about
0.103 to 0.198 cores; this is CPU time, not GPU engine utilization. No GPU
engine, battery, high-refresh display or low-end hardware result is claimed.
Paused and minimized runs produced zero city paints; minimized also performed
zero display polls. Live collector measurements and replay measurements are
kept separate because traffic and serialization workloads differ.
The final live-data run also passed `--assert-smooth`: 16.8 ms p95, 31.1 ms
worst paint gap, zero gaps over 50 ms and zero long tasks across five polls.

Rendered regression checks observed 3,008 changed road pixels, retained actor
identity and palette styles, zero whole-city refreshes across three transport
changes, a 16.8 ms p95 paint interval and a 22.2 ms maximum. They also passed
actual resident, builder, hauler, machine and crane motion at desktop, compact
and mobile sizes; measured construction progression; all twenty city tiers;
sorting, resizing and offscreen return; pause, motion disabled and OS reduced
motion. Desktop and compact captures were visually inspected. The unit suite
passed all 184 tests (the native Electron startup test required a rerun outside
the Windows sandbox); JavaScript and PowerShell syntax checks passed.

Evidence is under `test-results/performance/traffic-changes-{baseline,final}`,
`traffic-live-{before,final}`, and `test-results/canvas-renderer/`. Local traffic
snapshots and CPU profiles remain in ignored test output. The audit script now
records actual city paint intervals and style refreshes, supports `--live` and
`--snapshot=...`, and provides `--churn --assert-smooth` for the regression.

The 1.17.4 release build passed all 184 tests, syntax checks, native ETW and
Windows icon checks, rendered SVG/canvas checks and packaged desktop smoke
tests. The packaged app reported v1.17.4, real local snapshots without collector
or storage errors, blocked outbound renderer requests, and successful setup
cancellation/retry/recheck fixtures. These fixtures do not establish installed
UAC, reboot or upgrade acceptance. The release-run canvas continuity check
recorded a 19.1 ms worst paint interval and zero whole-city style refreshes.

## October 12: installed desktop bridge freeze

The user reported that 1.17.4 still froze all moving objects together. The
October 11 audit was incomplete: even its live-data mode fetched JSON through
a local protocol and did not exercise the installed app's isolated Electron
context bridge. Its successful timing checks did not establish smooth motion
in the installed application.

The corrected audit loads the actual sandboxed preload with context isolation
and the same snapshot IPC handlers as the desktop. The installed map, painter
and markup files were confirmed identical to the workspace's 1.17.4 source.
Window capture timed out, so this investigation does not claim a successful
direct recording of the user's running window.

A local snapshot contained 271 connections, 369 recent usage records and 6,872
lifetime records (5,833,297 JSON characters). Replaying it through the object
bridge reproduced **11 paint gaps over 50 ms across 11 polls in 22 seconds**,
with a worst gap of **112.5 ms** and three long tasks. No whole-city style
refreshes occurred. This isolates an additional cause beyond the earlier
scenery fixes: copying/freezing a large object graph across contextBridge on
the renderer thread.

The 1.17.5 change adds a fixed snapshot-text IPC operation. It carries the
authenticated companion reply as a string and parses it after the bridge in
the page world. The desktop process forwards the wire reply without parsing
and re-encoding it. Pipe input is assembled from decoded chunks rather than
repeatedly scanning the growing full reply. Authentication, frame-size limits,
error handling and the legacy object API remain intact. Collection, saved
history, measured totals, journey logic and artwork are unchanged.

An intermediate text bridge removed the per-poll stalls but a longer live test
still caught one 52.7 ms gap. The final wire-text path passed a 45-second live
desktop run with 22 polls: **16.8 ms p95, 49.6 ms maximum, zero gaps over 50 ms,
and zero long tasks**. Compact passed five polls with a 44.7 ms maximum and no
long tasks. Paused and minimized states made zero city paints. These are finite
measurements, not a promise of zero missed frames or a substitute for the
user's visual acceptance. The installed 1.17.4 app remains unmodified.

Performance audits now use the desktop bridge by default; `--fetch` retains
the old path solely for comparison. `--history-load` adds 7,000 lifetime
records and 400 recent history records using synthetic data. The release
build now requires this workload to pass the paint-cadence checks. New tests
cover exact snapshot totals, bridge errors, legacy callers, fragmented UTF-8
and truncated pipe frames. The packaged smoke test uses the same text path as
normal polling. Local evidence: `test-results/performance/ipc-before`,
`ipc-after`, `ipc-live-investigate`, `ipc-live-wire`, and `release-ipc`.

The synthetic large-history comparison reproduced 11 stalls across 11 polls
with the 1.17.4 client (115.9 ms maximum). The 1.17.5 release gate completed
the same 22-second workload with 11 polls, zero stalls over 50 ms, zero long
tasks, 16.9 ms p95 and a 48.9 ms maximum paint gap. Both runs used the isolated
desktop bridge. Evidence: `ipc-history-valid-baseline` and `release-ipc`.

Release verification passed all 188 tests, native capture/icon checks, rendered
city activity and construction checks, the large-history performance gate,
and packaged desktop/setup smoke checks. Packaged version 1.17.5 loaded 188
real connections through the text bridge with no capture or storage error.
Setup OS mutations were simulated; this did not install or replace the user's
running app. The packaged runtime files match the tested source by SHA-256.

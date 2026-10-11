# CPU and GPU audit — October 11, 2026

This records the initial audit, before the renderer redesign. The subsequent
[canvas renderer report](renderer-redesign-2026-10-11.md) contains its before/after
measurements and visual checks; it supersedes the renderer recommendations below.

The app is not yet inexpensive enough with dense animated cities visible. The
main remaining cost is CPU-side SVG rendering/compositing. This audit implements
substantial background collector savings and incremental SQLite checkpoints;
it does not claim to solve the city renderer's CPU budget. Changes are in the
workspace, not installed over the running 1.17.2 app.

## Measurements

An occupied core is CPU seconds divided by wall seconds, summed across the
specified processes. It is not Task Manager's whole-machine percentage.

| Scenario | Measured CPU |
| --- | ---: |
| Running installed app, long-lived processes, 20.14 seconds | 1.358 cores |
| Installed dashboard renderer | 0.974 cores |
| Installed dashboard GPU process (CPU work) | 0.295 cores |
| Installed companion main process | 0.036 cores |
| Ten-city fixture, three visible at 1440 × 1100 | 1.683 cores |
| Same fixture, two visible at 900 × 700 | 0.967 cores |
| Paused compact fixture | 0.079 cores |
| Minimized fixture | 0.0013 cores |

The installed 3D GPU engine averaged **0.304% busy**, with a copy engine at
0.005%. The companion's GPU engines were idle. These Windows engine counters
are not power measurements and should not be added together as device usage.
High CPU usage in Electron's GPU process does not imply high hardware GPU load.

The installed sample excludes short-lived snapshot children and inaccessible
privileged helpers. The renderer fixture excludes all real collectors. Those
numbers therefore must not be presented as total collection-and-rendering costs.
Snapshot CPU is measured separately below; WMI provider and native child costs
are outside its PowerShell process measurement. No wattage, battery-life,
high-throughput ETW saturation or multi-day soak result is claimed.

## Implemented collector savings

The old collector started PowerShell every eight seconds, opened each process
for identity information before querying the same information through CIM,
read version resources repeatedly for shared executables, and used adapter
configuration helpers with repeated table queries.

| Snapshot profile | CPU seconds | Elapsed seconds |
| --- | ---: | ---: |
| Original one-shot snapshot | 4.125 | 4.692 |
| Updated cold snapshot | 1.875 | 2.215 |
| Updated warm snapshot 1 | 0.422 | 0.750 |
| Updated warm snapshot 2 | 0.453 | 0.694 |
| Updated warm snapshot 3 | 0.266 | 0.667 |

Warm snapshots average 0.380 CPU-seconds, **91% less** than the original
one-shot sample. At the unchanged eight-second cadence, the measured snapshot
work contributes approximately **0.048 cores instead of 0.516**. This is an
estimate from the profiled work, not a measured whole-companion reduction.
The machine had roughly 330 processes and 260 connections during this profile.

- The companion and development server reuse one PowerShell worker. Each
  request reads new OS tables in a fresh function scope. No PID, DNS or adapter
  snapshot cache is carried between observations.
- A single CIM process query supplies names, paths, creation times, parents and
  sessions. Get-Process remains the fallback if CIM fails. Extended local paths
  are normalized so icon extraction and executable metadata keep working.
- Executable version metadata is deduplicated within each snapshot only.
- Adapter addresses, DNS, gateways and statistics are queried in batches.
  Hidden adapters and IPv6 addresses remain present.
- Responses retain the 12 MiB bound and 25-second deadline. Concurrent requests
  coalesce; failure kills the worker and the next request starts a replacement.
  Closing the parent's input pipe ends an idle worker. Collection stops cleanly
  during shutdown. The ETW traffic cadence is unchanged.

Tradeoff: keeping PowerShell warm retains its runtime memory between samples;
it avoids repeated startup and module-loading CPU. A long-duration working-set
soak remains useful before release.

## Implemented database savings

The old 15-second flush serialized and rewrote every record in each dirty day,
including earlier hours and inactive endpoints. It also prepared the same SQL
statements repeatedly. SQLite now retains pending usage rows and coverage hours
and writes only those, with reusable prepared statements. Empty ETW batches
avoid an empty connection-sightings transaction.

A regression fixture with 100 recorded endpoints and one changed endpoint
performs **one usage-row write instead of 100**. A subsequent idle coverage
checkpoint writes zero usage rows. Transaction rollback retains pending work
for retry. Reopening preserves earlier hours, loss counters, coverage, sightings
and lifetime city totals. No durability or retention setting was relaxed.

## Renderer findings and next priority

Four untraced desktop baselines were consistently about 1.67–1.69 cores. The
first fixture had 274 compositor layers and 183 accelerated transform layers.
Its vehicle JavaScript took only 0.172 CPU-seconds over 10.5 seconds. Optimizing
that loop alone will not recover a core.

The separate trace spent about 5.22 seconds in compositor layer construction
(`Layerize`) during a 10.5-second window, plus substantial style and paint work.
Trace categories overlap, so their durations must not be summed. Hardware
compositing and rasterization were enabled.

Diagnostic experiments, which were not retained in product code:

- Pausing offscreen CSS animations or adding card content containment did not
  materially improve the dense fixture.
- Removing sprite poses, foliage motion or filters did not provide a sufficient
  saving to justify degrading city activity.
- Filter-based layer grouping and scene isolation did not provide a reliable
  improvement.
- Temporarily suppressing vehicle drawing still cost about 1.50 cores; freezing
  CSS motion while retaining vehicle updates still cost about 1.36 cores. Either
  animation path keeps the expensive shared SVG pipeline active.

The next substantive work should prototype **cached architecture plus a small
number of dynamic canvas/sprite surfaces**, measuring against the current SVG
renderer before adopting it. Keep every resident, crew, crane, machine,
delivery and measured construction phase; carry their existing logical clocks
through polling, resizing and sorting. A modest display cadence can then be
tested without tying simulation time to frame count. This is a rendering
architecture change, not a recommendation to replace the city with a panorama.

Suggested acceptance targets for that follow-up: under 0.25 occupied cores for
three visible busy cities on this machine, no animation work while minimized,
and no loss of the existing rendered-motion/continuity checks. These are targets,
not achieved results. Electron's `setFrameRate` applies to offscreen rendering;
it is not a normal-window frame cap ([Electron documentation](https://www.electronjs.org/docs/latest/api/web-contents/#contentssetframeratefps)).

## Other reviewed paths

- Hidden dashboards already suspend display polling and animation. Pause,
  motion disabled and reduced motion stop city movement; collection continues.
- Healthy setup checks run once per minute, off the snapshot path. Incomplete
  setup retries more frequently. Analytics refreshes are limited to 30 seconds.
- App icons have caches and bounded extraction batches. Browser extensions
  batch observations. The evidence store has a bounded record count and an
  index keyed by address.
- ETW aggregates two-second intervals and bounds flow counts, but allocates
  address strings, flow objects and keys per event. Profile this under sustained
  high throughput before deciding whether to pool or change its key structure.
- History currently loads retained hourly records into memory and queries them
  in JavaScript. Large, long-lived journals remain a scaling risk. Move filtering
  and aggregation into indexed SQLite queries in a separate measured change.
- The companion's idle Chromium helper processes used negligible CPU in this
  sample, although they retain memory. They were not the dominant CPU problem.

## Verification and reproduction

Passed: 182 automated tests, JavaScript and PowerShell syntax checks, native
desktop smoke, and the persistent-worker integration check. The integration
comparison preserved 333 process identities and all 15 adapters, including
existing addresses, DNS, gateways and measured counters. It verified reuse,
fresh timestamps, crash recovery and parent EOF shutdown. Unit cases also cover
split UTF-8, invalid/oversized responses, timeouts and shutdown.

Rendered verification passed at desktop, compact and mobile sizes. Actual
pixels changed across all four city quarters; residents, builders, cranes,
machinery and haulers moved. Measured growth advanced with the same native
animation objects. Pause, motion disabled and reduced motion froze movement;
residents continued when construction waited for data. Scroll, resize and sort
continuity passed. No city artwork or product animation was changed.

```powershell
npm run test:performance -- --label=audit-before
npm run test:performance -- --trace --desktop-only --label=audit-trace
npm run test:performance -- --draw-experiments --label=audit-draw
powershell.exe -NoProfile -File scripts/qa-resources.ps1
powershell.exe -NoProfile -File scripts/qa-collector.ps1 -Baseline
powershell.exe -NoProfile -File scripts/qa-collector.ps1 -Samples 4
node scripts/qa-snapshot-worker.mjs
npm test
npm run check
npm run test:desktop
node_modules/.bin/electron.cmd scripts/qa-city-vibrancy.mjs
```

`-Baseline` and the worker parity script read `HEAD:collector.ps1`; after these
changes are committed, use the previous revision for a historical comparison.
Run timed profiles sequentially and with the same acceleration mode. The
native Electron checks require execution outside Codex's process sandbox on
this Windows installation; the sandboxed launch failed on Electron directory
ACLs, while the unrestricted test run passed without changing those ACLs.

Raw local evidence is under `test-results/performance/`: `audit-before.json`,
`audit-diagnostics.json`, `audit-draw.json`, `audit-compositing.json`,
`audit-trace.json`, `installed-resources.json`, `collector-before.jsonl`,
`collector-after.jsonl` and `snapshot-worker.json`. Rendered evidence is under
`test-results/city-vibrancy/`. The full Chromium trace is large and local only.

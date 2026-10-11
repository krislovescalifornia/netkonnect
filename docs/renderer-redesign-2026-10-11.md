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

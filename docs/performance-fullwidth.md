# Full-width city rendering audit

Measured October 10, 2026 against the published 1.17.1 renderer (`51c5cc6`).
Two baseline runs and two working-tree runs used the same hardware-accelerated
Electron fixture: ten growing megacity cards, three visible at 1440 × 1100,
two visible at 900 × 700, and fresh traffic snapshots every two seconds.
Each active measurement lasted 10.5 seconds. Runs were sequential, without
Chromium tracing during timed measurements.

| Measure | 1.17.1 baseline | Updated renderer |
| --- | ---: | ---: |
| Full-width CPU, average occupied cores | 2.03 | 1.69 (17% lower) |
| Full-width frames per second | 41.2 | 58.8 |
| Full-width 95th-percentile frame interval | 33.4 ms | 16.8 ms |
| Compact CPU, average occupied cores | 1.22 | 0.86 (29% lower) |
| Compact frames per second | 59.7 | 59.9 |
| Initial desktop compositor layers | 430–432 | 298–302 |
| Full-width renderer working set, average | 454 MiB | 423 MiB |

CPU means aggregate Electron process CPU seconds divided by elapsed seconds;
it is not Task Manager's whole-machine percentage. Full-width savings varied
from 13% to 21% across the two runs. Both updated full-width runs had no long
tasks. The fixture excludes the independent PowerShell collector and does not
measure watts or Windows' power-usage classification. Dense cities still occupy
about 1.6–1.8 CPU cores on this machine.

## Retained changes

The baseline paint trace showed compositor layer updates taking substantially
more time than the vehicle JavaScript loop. The changes reduce layer work:

- Neighboring residents share a walking layer in fixed groups of eight, with
  up to seven groups. Every person retains an individual anchor, scale and
  stride phase. New city tiers add people without reparenting existing residents.
  The complete population still grows from 12 to 50 people across 20 tiers.
- Builders retain the illustrated four-pose work sequence and staggered phases.
  Removing a second rotation on their outer viewport avoids redundant layers.
- Fully invisible delivery staff and cargo skip painting while their animation
  clocks continue. Real unloading, carrying and installation remain visible.

The animation cadence is unchanged. Cranes, machinery, transit, pedestrians,
construction sites and deliveries remain present. Continuous custom-property
transforms, architecture caching and explicit offscreen animation suspension
were tested and discarded because their extra costs or continuity risks
outweighed their benefit.

## Reproduction and verification

Before committing, run these sequentially with the same acceleration mode:

```sh
npm run test:performance -- --baseline --label=before
npm run test:performance -- --label=after
```

Reports and screenshots are written under `test-results/performance`.
`--desktop-only` measures full-width cards alone; `--census` inventories
compositor layer owners; `--trace` records paint timings separately from the
comparison above. Foreground runs disable window-occlusion throttling and focus
the fixture window. Minimized checks restore background throttling.

Native UI verification exercises rendered activity across city quarters at
desktop, compact and mobile sizes, measured construction progression,
resident timelines through every growth tier, delivery motion, pause,
motion settings, reduced motion, resizing, sorting and scrolling. The automated
test suite includes an explicit complete-population check for every city tier.

Validation passed: 178 automated tests, JavaScript and PowerShell syntax checks,
`qa-animation --growing`, `qa-city-vibrancy`, `qa-settlements`, and
`qa-project-logistics`. The traffic continuity check passed with
`qa-city-traffic --motion-only`; the existing artwork sizing assertions were
outside this performance pass. Road, rail and water handoffs changed painted
pixels at all three window sizes, and all 50 residents retained their native
stride animation objects through population growth.

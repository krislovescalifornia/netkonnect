# Every byte builds — illustrated world

Generated with the built-in imagegen tool using the user's original poster and
the revised truck strip as style references. The art uses navy ink, watercolor
texture, ivory architecture, terracotta accents, blue glass, and sage greenery.

`cities/` contains 20 individually generated growth stages. Markets, cafes,
pedestrians, gardens, transit, and distinct buildings give each stage a sense of
inhabited place. The later stages add denser skylines and optimistic technology.

`fleet/` contains 13 transport tiers plus crew, crane, and parachute artwork.

`construction/` contains imagegen excavators and cement mixer trucks, each with
three paint variations. Every moving city machine uses these transparent PNGs;
the original SVG machine drawings have been replaced. The exact built-in tool
prompts and style references are saved in `construction/generation-prompts.json`.
Original generated pixels and alpha are preserved, and `CONSTRUCTION_ART` in
the measured manifest supplies the sprite frames and offline asset list.
Machines follow supply-to-foundation circuits within construction yards and respect
pause/reduced motion.
`trucks/` contains seven road tiers. All 20 traveling vehicles are drawn in true
side profile, facing right, with three paint/material variants. Downloads mirror
the artwork horizontally. The broadside view follows the horizontal route.
`reference-poster.png` preserves the user's style reference.

`brands/` contains 29 transparent watercolor app/service emblems made with the
built-in imagegen tool. The initial 22 use locally bundled SVGs in `public/icons/`
as shape references; six wishlist additions use installed application PNG icons
preserved in `brands/references/`. Windows Service Host uses an original painted
gear pair. The poster supplies the painting style. Brand colors and
identifying shapes remain recognizable at 18–32px. Claude and Anthropic retain
their shared sunburst; Codex, ChatGPT and OpenAI share the knot emblem.
Exact prompts and generation provenance are in `brands/generation-prompts.json`.
The original generated PNG pixels are preserved. `BRAND_ART` measures alpha bounds
to normalize transparent padding in the shared `brandBadge` renderer, so tables,
routes, analytics and dossiers all use the same watercolor assets. They are
included in the HTTP allowlist and required desktop bundle, with no remote loads.
Unknown apps retain text monograms. Original SVG sources and their license remain
in place. `electron scripts/qa-brand-artwork.mjs` reviews all 29 emblems enlarged
and at badge sizes, genuine alpha, and desktop/phone dashboard layouts.

The October 10 wishlist batch adds Node.js, Electron, Git, Windows Service Host,
Epic Games Launcher, Creality Print and PioneerGame. Git LFS and its HTTPS helper
share Git; GitHub CLI and Steam's web helper reuse their existing brand art.
`brands/wishlist-2026-10-10.json` records the ten selected processes and measured
traffic ranking. The companion's original wishlist contained null bytes and
could not be read; the user selected the ten highest-traffic missing apps from
recovered month analytics. This is a byte ranking, not a reconstructed network-time
ranking. The damaged wishlist and original history remain untouched. The badge QA
also saves `test-results/watercolor-icons/wishlist-icons.png` for this batch.

`details/` finishes the illustrated world with four-phase house and tower
construction sheets (including scaffold), timber and crate supplies, rigged
crane cargo, a delivered parcel, the Little Secrets researcher, three setup crew
portraits, and the quiet journal companion. All eight sheets were individually
generated with the built-in imagegen tool. Exact prompts and reference roles
are recorded in `details/generation-prompts.json`.
`DETAIL_ART` measures clear sprite gutters and alpha bounds; phase sheets share
their scale and bottom anchor, and per-cell clips keep neighbouring images out.
The source pixels and transparency are preserved. Construction stages cross-fade
with measured progress while live workers, hoists, and delivery motion continue
independently. Decorative portraits use empty alt text or hidden SVGs beside
the existing status text.

Open cargo sheets contain loaded variants in the upper row and matching empty
variants in the lower row. Both filename aliases contain the original sheet;
their measured viewports select the appropriate row. Equal viewport sizes and
matched anchors preserve scale and baseline during unloading; aircraft with
hanging cargo align their rotors to retain flight level. Separate clipping
boxes prevent a tall empty viewport from revealing the neighbouring loaded row.

`generation-prompts.json` records the exact generation prompts. The companion
`edit-prompts.json` records empty-bed edits, and `repair-prompts.json` records the
rotor-spacing repair. No API key or CLI generation was used.
`side-profile-prompts.json` records the replacement vehicle prompts and layout
repairs made with the built-in tool, and is the current source for vehicle frames.

`manifest.js` is generated by `scripts/measure-artwork.py` using Pillow. It
measures meaningful alpha bounds without altering, cropping, or recoloring any
source PNG. `illustration-art.js` clips those shared images directly in SVG and
fits them into existing scene bounds. Live crew and delivery motion remain
separate from the static dioramas and pause with the app's motion settings.

Visual review: `electron scripts/qa-artwork.mjs` (all paint variants and actual
lane sizes), `electron scripts/qa-progression.mjs`,
`electron scripts/qa-cities.mjs`, and `electron scripts/qa-trucks.mjs`.
`electron scripts/qa-decoration.mjs` reviews every finishing asset enlarged and
at scene size, the Secrets postcard/banner, and setup states at desktop and phone
widths. Construction and delivery QA also check that these layers contain images
instead of geometric artwork and preserve unload/landing behavior.

Living city landscapes
----------------------

`world/meadow-v1.png` paints the entire terrain with grass, distant hills,
sky, a stream and edge wildlife. `world/environment-v1.png` supplies six
transparent watercolor cells: clouds, birds, trees, streetlamps, freight dock
and park. Both were generated with the built-in imagegen tool, using the
original poster as the style reference; exact prompts are in
`world/generation-prompts.json`. Source PNG pixels and alpha are preserved.

`world.js` layers evolving painted dirt, gravel, paved, boulevard and highway
terraces beneath the existing city art. Downloads flow from the left app
card into the right city and unload; uploads take a separate return road.
Rail unlocks at level 11; river ports unlock at level 13. Explicit rail or ship
transport previews open their matching corridor earlier, and that corridor
remains until its last in-flight journey finishes.

More measured lifetime downloads add trees, parks, lamps, bird flocks and
road capacity. Traffic density and vehicle type still use measured throughput.
The local computer clock sets sunrise (05–08), day (08–17), sunset (17–20)
and night (20–05); this is a clock-based art cycle, not a geographic solar
calculation. Sun position advances with the clock. Clouds and birds retain
their animation objects through polling, resizing and growth. Motion settings
and reduced motion freeze animation; the clock can still update lighting.
All assets are bundled and served locally, without runtime network requests.

`electron scripts/qa-cities.mjs` checks all 20 growth stages, clocks while
paused, cleanup, cloud continuity, responsive layout, deliveries and reduced
motion, and renders sunrise/day/sunset/night screenshots. The animation stress
test checks ten busy cities without per-frame animation or layout reads.

Twenty evolving backgrounds
---------------------------

`world/backgrounds/` now contains one individually generated panorama per
city level, in the exact order of the twenty city milestones. The progression
moves from untouched woodland and a cabin clearing through gardens, farmland,
estates, neighborhoods, suburbs, village and town landscapes; the later levels
add modern skylines, regional transport hubs, metropolitan ports, civic
districts, megacity density, green towers, smart transit, arcologies, spaceports
and a space-age city with orbital infrastructure and floating gardens.

All twenty backgrounds use the built-in imagegen tool and the original poster
and meadow as style/composition references. The source PNG pixels are preserved.
Exact prompts and generated-source provenance are saved in
`world/backgrounds/generation-prompts.json`.

`WORLD_BACKGROUNDS` in `world.js` maps each measured stage to its own file.
Level changes update the existing terrain image, preserving the SVG, clouds,
crews and traffic animation timelines. The local-clock lighting applies to every
background. The old meadow remains a style reference. The local HTTP allowlist
and required desktop bundle include all twenty new background files.

`electron scripts/qa-world-backgrounds.mjs` renders a gallery of the full
20-image progression and a live comparison of levels 2, 15 and 20. City QA
checks the correct background during all twenty stage transitions. Unit tests
verify matching level names, distinct source hashes, panoramic geometry,
stage selection and offline asset availability.

Evolving transport terraces
---------------------------

`world/transport/` contains three original transparent imagegen atlases: six
road surfaces, rail/water/runway strips, and airport/spaceport destinations.
`generation-prompts.json` preserves the exact built-in prompts and source
provenance. The approved design references remain in `output/road-concepts/`.
No vehicle pixels are baked into the scenery; all live fleet sprites remain
independent.

`scripts/measure-transport-art.py` measures the alpha bands into `frames.js`.
SVG viewports clip the unchanged source pixels, with terrain strips stretched
horizontally to fit each responsive scene. Dirt and gravel have separate
material textures; paved tiers add markings, curbs and low barriers. All
moving contact lines are horizontal, so the static side-profile fleet stays
level and keeps its original proportions. Rail, canal and air corridors
accumulate beside the road pair; airport/spaceport destinations follow growth.
Contact shadows and ship wakes are lightweight independent overlays.

Levels 1–2: dirt; 3–4: gravel; 5–6: single lane; 7–10: boulevard;
11–14: small highway; 15–20: large highway. Rail unlocks at 11, airport at 12,
port at 13 and spaceport at 19. Transport previews expose matching corridors
earlier; each stays visible until its last in-flight journey completes.
The shared WORLD_ASSETS list supplies HTTP and desktop bundle verification.

`electron scripts/qa-transport-world.mjs` checks all six road materials,
mixed sea/air traffic, flat sprites, retained departure geometry, loaded
artwork, corridor draining and desktop/phone layouts. City and animation QA
continue to verify live growth, delivery, pause/reduced motion and polling.

Integrated city landscapes and lane readings
------------------------------------------

`world/settlements/` contains five transparent imagegen atlases, each with four
panoramic growth stages, covering all twenty existing milestones. Eye-level
architecture, watercolor vegetation and natural base edges replace the small
isometric islands in route scenes. The settlement extends across 78% of each
responsive landscape. The original catalog illustrations remain available.
`frames.js` clips individually measured alpha bands without changing PNG pixels.
Exact built-in tool prompts and source provenance are in `generation-prompts.json`.

Night grades the terrain, settlement pixels, roads and landscape props separately.
Warm facade windows, street lamps, vehicle headlights, site floodlights and safety
beacons remain emissive; residents and crews stay clearly visible. Facade lighting
uses authored source-atlas coordinates and follows the measured skyline reveal.
Growth still reveals the next skyline using measured downloads, and animation
nodes survive growth, polling and resizing.

Download and Upload readings sit on their actual road, rail, water or air
baseline, using the same transport specifications as live vehicles. Both readings
sit on the left as white Down/Up labels with one decimal place in Mbit/s, without
borders or colored badges. The wider road spacing makes the directions distinct.
Downloads pull in and unload, then continue right while fading out; parcels stay
at the delivery point during departure.

Permanent living-city requirement
--------------------------------

The route city must remain visibly alive and bustling as measured data builds it.
Landscape art supports the dynamic city, and must not replace it. `AGENTS.md`
records this permanent requirement for future work.

Construction projects, crane hoists, machines, delivery crews and helpers now
occupy independent anchors throughout the expanded settlement. Position metadata
moves the anchors during layout without scaling or resetting animation nodes.
Residents are about 14 world units tall, semis about 29, and cart handlers taller
than their carts. Machinery stays larger than its crew. Three depths of work yards
hold supplies, projects and machine circuits above the dedicated Data Traffic road.
All twenty measured stages keep their
construction phases and live delivery behavior.

`world/settlements/residents-v1.png` is an original transparent built-in imagegen
atlas of two residents with four walking poses each. `resident-prompts.json`
records its exact prompt, source and layout. Clipped SVG viewports cycle poses
with CSS while residents walk and turn around. Resident count increases with
city tier (8 to 27), and ordinary street life continues while construction waits
for incoming traffic. Pause and reduced motion stop both ambient and work motion.

QA must verify actual pose changes, animation continuity, visible population and
construction distributed across the scene, and measured building progression.

Night lighting and construction vibrancy
---------------------------------------

Construction has two to six machines per city tier, larger crews, supply haulers,
staggered crane lifts, digging and mixer poses, dust, and tool sparks. Measured
progress controls project phases, window completion and worksite retirement.
Without incoming data the machinery and crews wait; residents keep walking.

Run `electron scripts/qa-city-vibrancy.mjs` for desktop, compact and mobile
frame captures, rendered pixel changes distributed across the city, measured
growth, timeline preservation through polling/sorting/resizing, night and day
lighting, pause, motion-disabled, reduced-motion and idle checks.

The `fleet/activity/` and `construction/activity/` textures are isolated crops of
the original artwork, resized for animation. Regenerate them with
`electron scripts/build-activity-sprites.mjs` after atlas changes. Offscreen cities
keep their animation timelines and journey geometry while skipping paint work.

`fleet/traffic/` and `trucks/traffic/` hold 192px frame textures from the same source
atlases, with their measured clip masks and alpha. The same build script packages
them. Moving vehicles use these small textures to avoid repainting whole atlases.
Vehicles brake into delivery bays, unload, then accelerate away on continuous
paths. Slow frames advance at most 50ms of visual travel to prevent teleporting.
Uploads start beyond the right viewport edge and finish beyond the left, including
the full vehicle, handler and light beam. Departure geometry remains fixed through
refreshes and responsive layout changes. Traffic positions have no CSS transition
lag. Crane hoists replace the atlas's fixed rig with an attached moving load and
a cable that extends from the authored boom trolley and tracks its lift exactly.
`electron scripts/qa-city-traffic.mjs` verifies rendered proportions, road clearance,
motion in depth, frame continuity, cargo delivery and pause/reduced motion at
desktop, compact and phone sizes.
`electron scripts/qa-crane-uploads.mjs` checks cable attachment throughout visible
lifts and the full rendered upload silhouette entering/exiting the viewport.

City cards now use the full scene width, with app identity over the upper-left
scenery. One left-aligned footer contains the city level and measured growth,
with start/finish download thresholds and the remaining bytes to the next level;
App Info stays at the left edge with a dropdown caret. Its expanded panel holds the three hourly graphs,
application facts and the associated service/destination rows. On narrow cards,
growth fits beneath the level while keeping App Info reachable.

All sky artwork uses built-in imagegen watercolor pixels from `world/sky/`:
kites, swallows, drones, UFOs, clouds, sun, moon and distant starlight. Original
transparent sources and exact prompts are retained in that folder. Regenerate
small runtime textures with `electron scripts/build-sky-sprites.mjs`.
The old code-drawn sky visitors and unattended parachute parcel are removed.
Each city starts with 60–180 seconds of quiet, then shows one visitor for 18–28
seconds followed by a freshly randomized 150–450 second quiet gap. No consecutive
visitors repeat the same kind; UFOs have the lowest daytime selection weight.
Schedules use the paused visual clock and survive polling, growth, sorting and
resizing. Stars twinkle at night; birds and kites are daytime sightings.
All activity honors pause, motion settings and reduced motion. Landscape framing
and capped skyline height preserve open sky at wide card sizes.
Run `electron scripts/qa-sky-cards.mjs` to verify visible sky movement, layout,
App Info graphs, night stars, timeline continuity and motion controls.

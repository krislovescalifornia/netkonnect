# Illustrated road fleet

These transparent PNG strips replace the simplified geometric road sprites.
They were generated with the built-in imagegen tool using the user's original
“Every byte builds” poster as the illustration reference. Exact final prompts
are recorded in `generation-prompts.json`.

Each strip contains three paint variations of one truck tier. `truck-art.js`
stores measured alpha bounds and clips the original strip directly in SVG;
the PNGs are not cropped or recolored at runtime. Paint is chosen once from
the departure ID. Downloads mirror the same artwork to face the city.

Pickups and open heavy lorries have matching empty-bed strips. The loaded
illustration fades onto the empty bed during delivery; enclosed trucks keep
their body and trailer. The existing timing, tiers and traffic measurements
are unchanged.

Run `electron scripts/qa-trucks.mjs` for the illustration contact sheet,
actual-size previews, image loading checks and persistent-node delivery checks.

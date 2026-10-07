# Illustrated road fleet

These transparent PNG strips replace the simplified geometric road sprites.
They were generated with the built-in imagegen tool using the user's original
“Every byte builds” poster as the illustration reference. Exact final prompts
are recorded in `../side-profile-prompts.json`. Historical three-quarter prompts
remain in `generation-prompts.json` for provenance.

Each strip contains three paint variations of one truck tier in strict side
profile, facing right with circular wheels on a level baseline. `truck-art.js`
stores measured alpha bounds and clips the original strip directly in SVG;
the PNGs are not cropped or recolored at runtime. Paint is chosen once from
the departure ID. Downloads mirror the same artwork to face the city.

Pickups and open heavy lorries have loaded and empty rows in the same source
sheet, exposed through the existing loaded and empty filenames. Equal frame
sizes and bottom anchors keep their wheels aligned; per-row clips exclude the
neighbouring sprites. The loaded
illustration fades onto the empty bed during delivery; enclosed trucks keep
their body and trailer. The existing timing, tiers and traffic measurements
are unchanged.

Regenerate both truck and fleet frame metadata with `scripts/measure-artwork.py`.

Run `electron scripts/qa-trucks.mjs` for the illustration contact sheet,
actual-size previews, image loading checks and persistent-node delivery checks.

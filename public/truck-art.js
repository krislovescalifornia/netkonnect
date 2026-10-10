// Side-profile ink-and-watercolor illustrations. Frames are measured alpha
// bounds, not equal thirds: keep mirrors and bumpers intact when clipping.
export const TRUCK_ART={"pickup":{"size":[2172,724],"frames":[[30,74,677,303],[751,74,677,303],[1474,74,677,303]],"clips":[[30,74,677,303],[752,74,676,303],[1474,74,677,303]],"empty":{"size":[2172,724],"frames":[[30,386,677,303],[751,386,677,303],[1474,386,677,303]],"clips":[[30,411,677,278],[751,410,677,279],[1474,410,677,279]]}},"microvan":{"size":[2172,724],"frames":[[35,197,681,332],[769,197,672,332],[1484,197,670,332]]},"cargo-van":{"size":[2172,724],"frames":[[29,199,680,320],[751,199,679,321],[1470,199,680,320]]},"box-truck":{"size":[2172,724],"frames":[[25,194,692,335],[750,194,691,335],[1471,194,690,335]]},"rigid-truck":{"size":[1536,1024],"frames":[[13,206,508,228],[536,206,477,228],[1039,205,489,230]],"clips":[[13,206,508,228],[536,206,477,228],[1039,205,489,230]],"empty":{"size":[1536,1024],"frames":[[13,598,508,228],[536,598,477,228],[1039,596,489,230]],"clips":[[13,601,507,225],[536,602,477,224],[1039,601,489,225]]}},"semi":{"size":[2172,724],"frames":[[24,234,702,212],[752,234,682,212],[1461,234,686,212]]},"double-semi":{"size":[2172,724],"frames":[[27,280,685,176],[749,280,685,176],[1471,280,683,176]]}};
export const TRUCK_ASSETS=Object.entries(TRUCK_ART).flatMap(([id,art])=>[
  `artwork/trucks/${id}.png`,...(art.empty?[`artwork/trucks/${id}-empty.png`]:[]),
  ...art.frames.flatMap((_,i)=>[`artwork/trucks/traffic/${id}-${i}.png`,...(art.empty?[`artwork/trucks/traffic/${id}-empty-${i}.png`]:[])])
]);

function sprite(id,art,variant,width) {
  const [x,y,w,h]=art.frames[variant],padding=2;
  const height=(h+2*padding)*width/(w+2*padding);
  // Baseline matches the other transport tiers, including mirrored downloads.
  return `<image data-art-source="artwork/trucks/${id}.png" href="artwork/trucks/traffic/${id}-${variant}.png" x="${-width/2}" y="${11-height}" width="${width}" height="${height}"/>`;
}

export function illustratedTruck(spec,appearance) {
  const art=TRUCK_ART[spec.id],variant=appearance%art.frames.length,width=spec.width-2;
  const loaded=sprite(spec.id,art,variant,width);
  // Cross-fade loaded pickups/lorries onto their empty beds during delivery.
  // Enclosed freight retains its trailer when the delivered parcel appears.
  return art.empty?{body:sprite(spec.id+'-empty',art.empty,variant,width),cargo:loaded}:{body:loaded,cargo:''};
}

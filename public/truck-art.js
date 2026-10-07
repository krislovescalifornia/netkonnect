// Three-quarter ink-and-watercolor illustrations. Frames are measured alpha
// bounds, not equal thirds: keep mirrors and bumpers intact when clipping.
export const TRUCK_ART={
  microvan:{size:[2172,724],frames:[[42,162,683,408],[770,161,671,408],[1490,161,672,408]]},
  pickup:{size:[2172,724],frames:[[40,201,681,329],[755,201,675,330],[1459,199,678,330]],empty:{size:[2172,724],frames:[[40,224,682,308],[755,224,677,308],[1460,224,681,308]]}},
  'cargo-van':{size:[2172,724],frames:[[31,171,681,381],[753,169,681,383],[1476,168,682,384]]},
  'box-truck':{size:[2172,724],frames:[[58,172,637,376],[768,172,637,376],[1477,172,637,376]]},
  'rigid-truck':{size:[2172,724],frames:[[19,230,694,326],[743,229,693,327],[1467,229,693,327]],empty:{size:[2171,724],frames:[[17,241,704,318],[744,242,702,317],[1469,241,702,318]]}},
  semi:{size:[2172,724],frames:[[44,212,665,298],[758,212,661,298],[1478,212,661,299]]},
  'double-semi':{size:[2172,724],frames:[[41,234,668,245],[758,234,667,245],[1477,234,668,245]]}
};
export const TRUCK_ASSETS=Object.entries(TRUCK_ART).flatMap(([id,art])=>[
  `artwork/trucks/${id}.png`,...(art.empty?[`artwork/trucks/${id}-empty.png`]:[])
]);

function sprite(id,art,variant,width) {
  const [x,y,w,h]=art.frames[variant],padding=2;
  const height=(h+2*padding)*width/(w+2*padding);
  // Baseline matches the other transport tiers, including mirrored downloads.
  return `<svg x="${-width/2}" y="${11-height}" width="${width}" height="${height}" viewBox="${x-padding} ${y-padding} ${w+2*padding} ${h+2*padding}" overflow="hidden"><image href="artwork/trucks/${id}.png" width="${art.size[0]}" height="${art.size[1]}"/></svg>`;
}

export function illustratedTruck(spec,appearance) {
  const art=TRUCK_ART[spec.id],variant=appearance%art.frames.length,width=spec.width-2;
  const loaded=sprite(spec.id,art,variant,width);
  // Cross-fade loaded pickups/lorries onto their empty beds during delivery.
  // Enclosed freight retains its trailer when the delivered parcel appears.
  return art.empty?{body:sprite(spec.id+'-empty',art.empty,variant,width),cargo:loaded}:{body:loaded,cargo:''};
}

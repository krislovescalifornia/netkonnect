import {SETTLEMENT_FRAMES} from './artwork/world/settlements/frames.js';
export const SETTLEMENT_ASSETS=['settlement-art.js','artwork/world/settlements/frames.js','artwork/world/settlements/residents-v1.png',...new Set(SETTLEMENT_FRAMES.map(frame=>frame.file))];
// Clip a measured alpha band without altering the original generated atlas.
export function settlementHeight(stage) {
  const frame=SETTLEMENT_FRAMES[Math.max(0,Math.min(19,Math.floor(stage)||0))];
  return 330*frame.box[3]/frame.box[2];
}
export function illustratedSettlement(stage) {
  const frame=SETTLEMENT_FRAMES[Math.max(0,Math.min(19,Math.floor(stage)||0))];
  const [x,y,w,h]=frame.box,height=330*h/w;
  return `<svg class="settlement-illustration" x="0" y="${129-height}" width="330" height="${height}" viewBox="${x} ${y} ${w} ${h}" overflow="hidden" aria-hidden="true"><image href="${frame.file}" width="${frame.source[0]}" height="${frame.source[1]}"/></svg>`;
}
export function settlementTransform(end) {
  const extent=end+245,width=extent*.78,scale=width/330;
  return `translate(${extent*.16-(end-80)} ${116-28-129*scale}) scale(${scale})`;
}

// The four walk poses slide beneath a fixed viewport; there is no per-frame JS.
export function illustratedResident(variant=0) {
  return `<svg class="resident-person" x="-10.5" y="-26" width="21" height="28" viewBox="0 0 384 512" overflow="hidden" aria-hidden="true"><image class="resident-stride" href="artwork/world/settlements/residents-v1.png" x="0" y="${variant%2* -512}" width="1536" height="1024"/></svg>`;
}
export function layoutSettlementActivity(svg,end) {
  const extent=end+245,left=extent*.16-(end-80),width=extent*.78;
  // Move anchors across the whole settlement, preserving people/machine proportions
  // and the inner animation nodes. Coordinates are stable authored metadata.
  for(const node of svg.querySelectorAll('.world-city .city-activity-anchor')) {
    const x=left+Number(node.dataset.cityX)/330*width,y=Number(node.dataset.cityY);
    const transform=`translate(${x} ${y})`;
    if(node.getAttribute('transform')!==transform)node.setAttribute('transform',transform);
  }
}

import {SETTLEMENT_FRAMES} from './artwork/world/settlements/frames.js';
export const SETTLEMENT_ASSETS=['settlement-art.js','artwork/world/settlements/frames.js','artwork/world/settlements/residents-v1.png',...new Set(SETTLEMENT_FRAMES.map(frame=>frame.file))];
// Clip a measured alpha band without altering the original generated atlas.
export function settlementHeight(stage) {
  const frame=SETTLEMENT_FRAMES[Math.max(0,Math.min(19,Math.floor(stage)||0))];
  return 330*frame.box[3]/frame.box[2];
}

// [source x, source y, columns, rows] on each illustrated facade.
// Atlas coordinates keep lit windows aligned through responsive scaling.
const WINDOW_FACADES=[
  [[578,226,1,1]],
  [[523,454,1,1],[580,454,1,1]],
  [[481,651,1,1],[569,656,1,1],[642,659,1,1],[402,710,1,1],[582,717,1,1],[644,718,1,1]],
  [[510,866,1,1],[561,866,1,1],[624,866,1,1],[562,916,1,1],[624,916,1,1]],
  [[245,181,1,1],[284,181,1,1],[336,190,1,1],[685,165,1,1],[729,161,1,1],[759,161,1,1],[813,162,1,1],[867,162,1,1],[896,162,1,1],[944,166,1,1],[734,210,1,1],[896,210,1,1]],
  [[108,478,1,1],[154,478,1,1],[234,443,1,1],[689,422,1,1],[749,422,1,1],[810,422,1,1],[689,468,1,1],[810,468,1,1],[1168,482,1,1],[1329,462,1,1],[1357,462,1,1]],
  [[52,709,1,1],[88,709,1,1],[211,702,1,1],[246,702,1,1],[410,700,1,1],[445,700,1,1],[564,710,1,1],[596,710,1,1],[945,638,1,1],[1104,705,1,1],[1141,705,1,1],[1255,693,1,1],[1290,693,1,1],[1385,709,1,1],[1420,709,1,1]],
  [[110,905,1,1],[162,889,1,1],[206,902,1,1],[239,902,1,1],[342,888,1,1],[382,888,1,1],[533,911,1,1],[565,911,1,1],[753,893,1,1],[790,893,1,1],[833,893,1,1],[1031,911,1,1],[1133,905,1,1],[1170,905,1,1],[1309,920,1,1],[1341,920,1,1]],
  [[191,211,1,1],[410,211,1,1],[441,210,1,1],[647,207,1,1],[859,118,1,1],[905,187,1,1],[1158,219,1,1],[1313,190,1,1],[1344,190,1,1],[1380,187,1,1]],
  [[86,424,2,1],[267,421,3,1],[370,419,3,1],[500,424,7,1],[720,420,3,1],[890,374,1,1],[952,416,1,1],[1160,425,2,1],[1238,407,4,1],[1384,428,2,1]],
  [[60,632,5,2],[194,649,2,2],[358,665,1,3],[383,665,1,3],[514,648,3,2],[692,659,3,2],[777,667,3,2],[902,674,2,1],[1066,654,2,2],[1153,650,3,2],[1390,656,3,2]],
  [[47,905,1,2],[146,881,3,1],[264,890,7,2],[430,913,3,1],[539,866,2,2],[653,904,2,2],[729,870,2,1],[868,909,2,1],[930,917,3,1],[1180,907,2,2],[1415,884,3,1]],
  [[155,164,2,3],[227,171,2,3],[455,151,2,4],[504,116,2,5],[634,134,2,4],[698,115,2,5],[751,73,2,7],[856,104,2,5],[943,101,1,5],[1146,134,2,4],[1240,123,2,5],[1345,106,2,5],[1420,151,2,3]],
  [[146,437,2,3],[446,406,2,3],[541,367,2,5],[912,356,2,5],[960,386,2,4],[1038,396,2,3],[1108,335,2,7],[1360,408,2,4],[750,444,2,2]],
  [[82,681,1,3],[245,653,1,4],[455,642,1,4],[529,647,1,4],[624,630,1,5],[681,606,1,6],[723,578,1,8],[804,565,1,8],[878,654,1,4],[997,661,1,3],[1139,668,1,3],[1277,615,1,6],[1358,653,1,4],[1427,668,1,3]],
  [[103,929,2,2],[209,871,2,4],[358,891,2,3],[411,865,2,4],[512,849,2,5],[646,845,2,4],[703,817,1,5],[817,840,2,4],[919,857,1,4],[1074,859,2,4],[1309,858,2,4],[1370,857,2,4]],
  [[402,197,7,1],[604,121,2,2],[645,92,1,5],[767,187,2,2],[805,118,1,3],[1053,100,1,5],[1104,85,1,6],[1166,157,2,2],[1282,145,1,3],[1400,164,2,2]],
  [[194,406,1,2],[515,357,1,3],[567,378,1,2],[731,330,1,3],[675,384,1,3],[747,403,2,1],[918,417,1,2],[993,415,1,2],[1160,367,2,3],[1215,375,2,2],[1380,392,1,3]],
  [[108,690,2,2],[260,616,1,5],[318,685,1,2],[442,593,1,7],[607,683,1,2],[761,579,1,7],[912,684,1,3],[1014,640,1,5],[1060,667,1,3],[1236,611,1,6],[1394,699,1,2]],
  [[82,890,1,3],[153,896,1,3],[318,867,1,5],[434,898,1,3],[534,897,1,3],[590,870,1,4],[761,856,1,5],[849,900,1,3],[934,881,1,4],[1040,858,1,5],[1138,852,1,5],[1298,911,1,3],[1346,880,1,4]]
];
function settlementWindows(stage) {
  const small=stage<9,w=small?10:6,h=small?16:8,dx=small?22:11,dy=16;
  return '<g class="settlement-lights" fill="#ffda87">'+WINDOW_FACADES[stage].flatMap(([x,y,columns,rows],facade)=>Array.from({length:columns*rows},(_,i)=>{
    if(!small&&(i+facade)%5===0)return '';
    return '<rect x="'+(x+i%columns*dx)+'" y="'+(y+Math.floor(i/columns)*dy)+'" width="'+w+'" height="'+h+'" rx="1" opacity="'+(.65+(i+facade)%3*.15)+'"/>';
  })).join('')+'</g>';
}

export function illustratedSettlement(stage) {
  stage=Math.max(0,Math.min(19,Math.floor(stage)||0));
  const frame=SETTLEMENT_FRAMES[Math.max(0,Math.min(19,Math.floor(stage)||0))];
  const [x,y,w,h]=frame.box,height=330*h/w;
  return `<svg class="settlement-illustration" x="0" y="${129-height}" width="330" height="${height}" viewBox="${x} ${y} ${w} ${h}" overflow="hidden" aria-hidden="true"><image href="${frame.file}" width="${frame.source[0]}" height="${frame.source[1]}"/>${settlementWindows(stage)}</svg>`;
}
export function settlementTransform(end,stage=0) {
  const extent=end+245,width=extent*.78,scale=width/330;
  // Widen the settlement without cropping its roofs out of wide cards. Reserve
  // an open sky above the tallest facade while keeping the shared ground line.
  const height=Math.max(settlementHeight(stage),settlementHeight(Math.min(19,stage+1)));
  const vertical=Math.min(scale,80/height);
  return `translate(${extent*.16-(end-80)} ${116-28-129*vertical}) scale(${scale} ${vertical})`;
}

// The four walk poses slide beneath a fixed viewport; there is no per-frame JS.
export function illustratedResident(variant=0) {
  return `<svg class="resident-person" x="-5.25" y="-14" width="10.5" height="14" viewBox="0 0 384 512" overflow="hidden" aria-hidden="true"><image class="resident-stride" href="artwork/world/settlements/residents-v1.png" x="0" y="${variant%2* -512}" width="1536" height="1024"/></svg>`;
}
export function layoutSettlementActivity(svg,end) {
  const extent=end+245,left=extent*.16-(end-80),width=extent*.78;
  // Move anchors across the whole settlement, preserving people/machine proportions
  // and the inner animation nodes. Coordinates are stable authored metadata.
  for(const node of svg.querySelectorAll('.world-city .city-activity-anchor')) {
    const x=left+Number(node.dataset.cityX)/330*width,y=Number(node.dataset.cityY);
    const transform=`translate(${x} ${y}) scale(${node.dataset.cityScale||1})`;
    if(node.getAttribute('transform')!==transform)node.setAttribute('transform',transform);
    if(node.classList.contains('construction-yard'))node.style.setProperty('--yard-span',Math.max(26,Math.min(65,width/(Number(node.dataset.siteCount)||3)*.25))+'px');
  }
  for(const path of svg.querySelectorAll('.city-footpath'))path.setAttribute('d',`M${left} ${path.dataset.footpathY}H${left+width}`);
}

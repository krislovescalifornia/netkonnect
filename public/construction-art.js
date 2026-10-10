import {PROJECT_FRAMES,LOGISTICS_FRAMES} from './artwork/construction/projects/frames.js';

export const CONSTRUCTION_ASSETS=['construction-art.js','artwork/construction/projects/frames.js',...new Set([...PROJECT_FRAMES.flatMap(project=>project.frames.map(frame=>frame.file)),...Object.values(LOGISTICS_FRAMES).map(frame=>frame.file)])];
export const PROJECT_NAMES=['Log cabin','Brick cottage','Family homestead','Farmhouse and barn','Stone mansion','Estate galleries','Terraced townhouses','Suburban apartments','Village market','Town hall','City office block','Regional station tower','Metropolitan skyscraper','Capital civic tower','Megacity supertall','Green terraces','Smart transit tower','Arcology atrium','Orbital assembly hall','Space-age habitat'];
export const MATERIALS=['bricks','wood','steel','glass','pipes','wires','concrete','panels'];

export function constructionSprite(frame,width,baseline=0,maxHeight=Infinity) {
  const [x,y,w,h]=frame.box,scale=Math.min(width/w,maxHeight/h);
  return `<svg x="${-w*scale/2}" y="${baseline-h*scale}" width="${w*scale}" height="${h*scale}" viewBox="${x} ${y} ${w} ${h}" overflow="hidden" aria-hidden="true"><image href="${frame.file}" width="${frame.source[0]}" height="${frame.source[1]}"/></svg>`;
}
export function projectArtwork(design,built,width,height) {
  const phase=Math.min(3,Math.max(0,(built-.18)/.82)*3),project=PROJECT_FRAMES[design];
  // Registered row boxes keep the foundation grounded while the floors rise.
  return project.frames.map((frame,i)=>`<g class="construction-phase${i===0?' foundation-bricks':''}" data-render-key="phase-${i}" opacity="${Math.max(0,1-Math.abs(phase-i))}"${i===0?` style="clip-path:inset(0 ${Math.max(0,1-built/.18)*100}% 0 0)"`:''}>${constructionSprite(frame,width,0,height)}</g>`).join('');
}
export function materialArtwork(id,width=17,baseline=0) {
  return `<g data-material="${id}">${constructionSprite(LOGISTICS_FRAMES[id],width,baseline,width*.72)}</g>`;
}
export function logisticsArtwork(id,width,height=width) {
  return constructionSprite(LOGISTICS_FRAMES[id],width,0,height);
}
export function terminalGeometry(mode,end) {
  const water=mode==='water',id=water?'dock-pier':'rail-gantry',frame=LOGISTICS_FRAMES[id];
  const [, ,w,h]=frame.box,scale=Math.min((water?98:85)/w,(water?94:68)/h);
  const x=end+(water?144:-20),y=water?256:246;
  return {x,y,rig:{x:x+(frame.rig.x-.5)*w*scale,y:y+(frame.rig.y-1)*h*scale}};
}
export function deliveryMaterial(stage,serial=0) {
  const choices=stage<2?['wood','bricks','pipes']:stage<8?['bricks','wood','concrete','pipes','wires']:stage<15?['steel','glass','concrete','pipes','wires']:['steel','glass','panels','pipes','wires'];
  return choices[Math.abs(Math.floor(serial))%choices.length];
}

// A load is handed off, lifted off its vehicle, carried into the settlement,
// and installed at a measured worksite. The paused journey clock owns this
// motion; no timers, random polling effects or synthetic growth are involved.
export function materialTransferPose(progress,{mode='road',from,to,hoist}) {
  const clamp=n=>Math.max(0,Math.min(1,n));
  const t=clamp((progress-.65)/.33),lift=mode==='water'||mode==='rail';
  const leg=t<.35?t/.35:(t-.35)/.65;
  const smooth=leg*leg*(3-2*leg);
  const handoff=lift&&hoist?{x:hoist.x,y:hoist.y+18}:{x:from.x-24,y:from.y-(lift?42:12)};
  const a=t<.35?from:handoff,b=t<.35?handoff:to;
  return {x:a.x+(b.x-a.x)*smooth,y:a.y+(b.y-a.y)*smooth,
    opacity:progress<.65?0:progress<.96?1:clamp((1-progress)/.04),
    t,carrying:t>=.35&&t<.94,lift:lift&&t<.35};
}

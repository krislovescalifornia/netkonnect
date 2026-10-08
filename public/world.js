import {TRANSPORT_FRAMES} from './artwork/world/transport/frames.js';
// Infrastructure uses measured growth. The sky follows the computer's local clock.
export const WORLD_BACKGROUNDS=Object.freeze([
  {
    "level": 1,
    "name": "Shack",
    "file": "artwork/world/backgrounds/level-01-shack-v1.png"
  },
  {
    "level": 2,
    "name": "Cabin",
    "file": "artwork/world/backgrounds/level-02-cabin-v1.png"
  },
  {
    "level": 3,
    "name": "House",
    "file": "artwork/world/backgrounds/level-03-house-v1.png"
  },
  {
    "level": 4,
    "name": "Homestead",
    "file": "artwork/world/backgrounds/level-04-homestead-v1.png"
  },
  {
    "level": 5,
    "name": "Mansion",
    "file": "artwork/world/backgrounds/level-05-mansion-v1.png"
  },
  {
    "level": 6,
    "name": "Estate",
    "file": "artwork/world/backgrounds/level-06-estate-v1.png"
  },
  {
    "level": 7,
    "name": "Neighborhood",
    "file": "artwork/world/backgrounds/level-07-neighborhood-v1.png"
  },
  {
    "level": 8,
    "name": "Suburb",
    "file": "artwork/world/backgrounds/level-08-suburb-v1.png"
  },
  {
    "level": 9,
    "name": "Village",
    "file": "artwork/world/backgrounds/level-09-village-v1.png"
  },
  {
    "level": 10,
    "name": "Town",
    "file": "artwork/world/backgrounds/level-10-town-v1.png"
  },
  {
    "level": 11,
    "name": "City",
    "file": "artwork/world/backgrounds/level-11-city-v1.png"
  },
  {
    "level": 12,
    "name": "Regional city",
    "file": "artwork/world/backgrounds/level-12-regional-city-v1.png"
  },
  {
    "level": 13,
    "name": "Metropolis",
    "file": "artwork/world/backgrounds/level-13-metropolis-v1.png"
  },
  {
    "level": 14,
    "name": "Capital",
    "file": "artwork/world/backgrounds/level-14-capital-v1.png"
  },
  {
    "level": 15,
    "name": "Megacity",
    "file": "artwork/world/backgrounds/level-15-megacity-v1.png"
  },
  {
    "level": 16,
    "name": "Green megacity",
    "file": "artwork/world/backgrounds/level-16-green-megacity-v1.png"
  },
  {
    "level": 17,
    "name": "Smart metropolis",
    "file": "artwork/world/backgrounds/level-17-smart-metropolis-v1.png"
  },
  {
    "level": 18,
    "name": "Arcology",
    "file": "artwork/world/backgrounds/level-18-arcology-v1.png"
  },
  {
    "level": 19,
    "name": "Orbital gateway",
    "file": "artwork/world/backgrounds/level-19-orbital-gateway-v1.png"
  },
  {
    "level": 20,
    "name": "Space-age metropolis",
    "file": "artwork/world/backgrounds/level-20-space-age-metropolis-v1.png"
  }
]);
export const WORLD_ASSETS=['artwork/world/meadow-v1.png','artwork/world/environment-v1.png',...WORLD_BACKGROUNDS.map(background=>background.file),
  'artwork/world/transport/frames.js',...new Set(Object.values(TRANSPORT_FRAMES).map(frame=>frame.file))];
export const WORLD_ROUTE_BASELINES=Object.freeze({
  road:Object.freeze({download:132,upload:164}),
  rail:Object.freeze({download:184,upload:200}),
  water:Object.freeze({download:216,upload:244}),
  air:Object.freeze({download:32,upload:67})
});
export function worldBackground(stage=0) {
  return WORLD_BACKGROUNDS[Math.max(0,Math.min(19,Math.floor(stage)||0))].file;
}
const clamp=n=>Math.max(0,Math.min(1,n));
export function worldTime(date=new Date()) {
  const hour=date.getHours()+date.getMinutes()/60;
  return {phase:hour<5||hour>=20?'night':hour<8?'sunrise':hour<17?'day':'sunset',hour,
    label:date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})};
}
export function infrastructure(stage=0) {
  stage=Math.max(0,Math.min(19,Math.floor(stage)||0));
  return {tier:stage<2?'trail':stage<4?'gravel':stage<6?'road':stage<10?'boulevard':stage<14?'highway':'superhighway',
    name:stage<2?'Dirt roads':stage<4?'Gravel roads':stage<6?'Single-lane roads':stage<10?'Boulevards':stage<14?'Small highways':'Large highways',
    port:stage>=12,rail:stage>=10,airport:stage>=11,spaceport:stage>=18,
    trees:2+Math.floor(stage/3),parks:Math.floor(stage/6),lamps:stage<6?0:1+Math.floor((stage-6)/3)};
}
// Side-profile sprites keep a level contact line at every city size and tier.
// Departures retain these points through growth and responsive layout changes.
export function worldRoute(direction='download',mode='road',end=655) {
  const start=28,span=Math.max(80,end-start);
  const y=(WORLD_ROUTE_BASELINES[mode]||WORLD_ROUTE_BASELINES.road)[direction==='download'?'download':'upload'];
  return [{x:start,y},{x:start+span*.32,y},{x:start+span*.69,y},{x:end,y}];
}
export const routePath=points=>`M${points[0].x} ${points[0].y}C${points.slice(1).map(p=>`${p.x} ${p.y}`).join(' ')}`;
export function routePoint(points,t) {
  t=clamp(t);const a=1-t,[p0,p1,p2,p3]=points;
  const x=a**3*p0.x+3*a*a*t*p1.x+3*a*t*t*p2.x+t**3*p3.x;
  const y=a**3*p0.y+3*a*a*t*p1.y+3*a*t*t*p2.y+t**3*p3.y;
  const dx=3*a*a*(p1.x-p0.x)+6*a*t*(p2.x-p1.x)+3*t*t*(p3.x-p2.x);
  const dy=3*a*a*(p1.y-p0.y)+6*a*t*(p2.y-p1.y)+3*t*t*(p3.y-p2.y);
  return {x,y,angle:Math.atan2(dy,dx)*180/Math.PI};
}
const cells={cloud:[0,0],birds:[1,0],trees:[2,0],lamps:[0,1],port:[1,1],park:[2,1]};
export function worldSprite(id,x,y,width,height=width*.8) {
  const [column,row]=cells[id];
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${column*512} ${row*512} 512 512" overflow="hidden" aria-hidden="true"><image href="artwork/world/environment-v1.png" width="1536" height="1024"/></svg>`;
}
// Clip original atlas pixels in nested SVGs, preserving source alpha and texture.
export function transportScenery(id,x,y,width,height) {
  const frame=TRANSPORT_FRAMES[id];
  return `<svg class="transport-scenery" data-scenery="${id}" x="${x}" y="${y}" width="${Math.max(1,width)}" height="${height}" viewBox="${frame.box.join(' ')}" preserveAspectRatio="none" overflow="hidden" aria-hidden="true"><image href="${frame.file}" width="${frame.source[0]}" height="${frame.source[1]}"/></svg>`;
}
export function worldRoads(stage,end=655,modes=[]) {
  const growth=infrastructure(stage),extent=end+245;
  const port=growth.port||modes.includes('water'),rail=growth.rail||modes.includes('rail'),air=growth.airport||modes.includes('air');
  const width=Math.max(80,end+24),depth={trail:20,gravel:21,road:22,boulevard:24,highway:26,superhighway:28}[growth.tier];
  const strips=(id,height,span)=>['download','upload'].map(direction=>{
    const baseline=WORLD_ROUTE_BASELINES[id==='water'?'water':id==='rail'?'rail':'road'][direction];
    return `<g data-render-key="${id}-${direction}" class="${direction==='download'?'incoming-road':'outgoing-road'}">${transportScenery(id,0,baseline-height/2,span,height)}</g>`;
  }).join('');
  const guides=['download','upload'].map(direction=>`<path class="air-guide ${direction}-guide" d="${routePath(worldRoute(direction,'air',end))}"/>`).join('');
  const markers=['download','upload'].map(direction=>{
    const color=direction==='download'?'#466d93':'#ae674b',baseline=WORLD_ROUTE_BASELINES.road[direction];
    return `<g class="route-direction ${direction}-direction" fill="${color}" transform="translate(8 ${baseline})"><path d="${direction==='download'?'M0 -2H9L6 -5M9 -2L6 1':'M9 -2H0L3 -5M0 -2L3 1'}" stroke="${color}" fill="none" stroke-width="1.2"/></g>`;
  }).join('');
  return `<g class="city-supply-road world-roads" data-infrastructure="${growth.tier}">
    <g class="world-airport" opacity="${air?1:0}">${guides}${transportScenery('runway',end+22,104,Math.max(80,extent-end-34),9)}</g>
    ${strips(growth.tier,depth,width)}${markers}
    <g class="world-rail" opacity="${rail?1:0}">${strips('rail',8,width)}</g>
    <g class="world-river" opacity="${port?1:0}">${strips('water',23,Math.max(80,end+185))}</g>
  </g>`;
}
export function worldNature(stage,end=655,modes=[]) {
  const growth=infrastructure(stage),extent=end+245,port=growth.port||modes.includes('water'),air=growth.airport||modes.includes('air');
  // Tall props sit behind the contact lines, leaving each moving silhouette clear.
  const trees=Array.from({length:growth.trees},(_,i)=>`<g data-render-key="world-tree-${i}">${worldSprite('trees',42+i*(extent-150)/growth.trees,83+(i%2)*7,23+(i%3)*6,30)}</g>`).join('');
  const parks=Array.from({length:growth.parks},(_,i)=>`<g data-render-key="world-park-${i}">${worldSprite('park',end+36+i*46,176,36,24)}</g>`).join('');
  const lamps=Array.from({length:growth.lamps},(_,i)=>`<g class="world-lamp" data-render-key="world-lamp-${i}">${worldSprite('lamps',end*.33+i*65,91,18,33)}</g>`).join('');
  return `<g class="world-nature">${trees}${parks}${lamps}<g class="world-air-terminal" opacity="${air?1:0}" data-airport="${growth.spaceport?'spaceport':'airport'}">${transportScenery(growth.spaceport?'spaceport':'airport',end+52,49,115,55)}</g><g class="world-port" opacity="${port?1:0}">${worldSprite('port',extent-123,203,104,49)}</g></g>`;
}
export function worldSky(stage,end=655) {
  const extent=end+245,flocks=1+Math.floor(stage/7);
  return `<g class="world-sky" aria-hidden="true"><g class="world-cloud" style="--cloud-delay:-12s">${worldSprite('cloud',extent*.18,-12,105,63)}</g><g class="world-cloud" style="--cloud-delay:-39s;--cloud-duration:83s">${worldSprite('cloud',extent*.61,-6,78,48)}</g>
    ${Array.from({length:flocks},(_,i)=>`<g class="world-birds" data-render-key="world-birds-${i}" style="--bird-delay:-${i*11}s;--bird-duration:${39+i*7}s">${worldSprite('birds',extent*.16+i*extent*.22,17+i%2*16,38,22)}</g>`).join('')}
    <circle class="world-sun" cx="${extent*.75}" cy="12" r="11"/><g class="world-moon"><circle cx="${extent*.75}" cy="12" r="10" fill="#fff1c5"/><circle cx="${extent*.75+5}" cy="8" r="9" fill="#283c68"/></g>
    <g class="world-stars" fill="#fff1c5">${Array.from({length:18},(_,i)=>`<circle cx="${25+(i*113)%(extent-50)}" cy="${-9+(i*17)%62}" r="${i%3===0?1.2:.7}"/>`).join('')}</g></g>`;
}
export function worldBackdrop(stage=0) {
  return `<image class="world-terrain" href="${worldBackground(stage)}" data-background-stage="${Math.max(0,Math.min(19,Math.floor(stage)||0))}" x="0" y="-20" width="900" height="280" preserveAspectRatio="xMidYMid slice"/><rect class="world-time-wash" x="0" y="-20" width="900" height="280" fill="#18325c"/>`;
}
export function updateWorldTime(svg,date=new Date()) {
  const time=worldTime(date);
  if(svg.dataset.time!==time.phase)svg.dataset.time=time.phase;
  const sun=svg.querySelector('.world-sun'),extent=(Number(svg.dataset.sceneEnd)||655)+245;
  if(sun) {const daylight=clamp((time.hour-5)/15);sun.setAttribute('cx',extent*(.17+.65*daylight));sun.setAttribute('cy',45-50*Math.sin(Math.PI*daylight));}
  const label=svg.closest('.city-detail-card')?.querySelector('.city-world-clock');
  if(label) {label.textContent=`${time.phase==='sunrise'?'Sunrise':time.phase==='sunset'?'Sunset':time.phase==='night'?'Night':'Day'} · ${time.label}`;label.title='Scenery follows your local clock · sunrise 05–08, day 08–17, sunset 17–20, night 20–05';}
}
export function layoutWorld(svg,end,patch=(node,markup)=>{node.innerHTML=markup;}) {
  const stage=Number(svg.dataset.stage)||0;
  const terrain=svg.querySelector('.world-terrain');
  if(terrain&&terrain.getAttribute('href')!==worldBackground(stage)) {
    terrain.setAttribute('href',worldBackground(stage));
    terrain.dataset.backgroundStage=stage;
  }
  const modes=[svg.dataset.downloadType,svg.dataset.uploadType].map(type=>type==='freight-train'?'rail':['barge','freighter','mega-ship'].includes(type)?'water':['helicopter','tiltrotor','cargo-plane','cargo-jet'].includes(type)?'air':'road');
  const replace=(selector,markup)=>{const target=svg.querySelector(selector);if(target)patch(target,markup);};
  replace('.world-infrastructure',worldRoads(stage,end,modes));
  replace('.world-decoration',worldNature(stage,end,modes));
  replace('.world-atmosphere',worldSky(stage,end));
  svg.querySelector('.world-city')?.setAttribute('transform',`translate(${end-80} 28)`);
  for(const node of svg.querySelectorAll('.world-terrain,.world-time-wash'))node.setAttribute('width',end+245);
}

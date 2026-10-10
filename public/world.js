import {SETTLEMENT_ASSETS,settlementTransform,layoutSettlementActivity} from './settlement-art.js';
import {transportSpec} from './vehicles.js';
import {TRANSPORT_FRAMES} from './artwork/world/transport/frames.js';
import {SKY_ART} from './artwork/world/sky/frames.js';
import {logisticsArtwork} from './construction-art.js';
import {LIVING_ASSETS,livingBackdrop,layoutLivingCity} from './living-city.js';
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
export const WORLD_ASSETS=[...SETTLEMENT_ASSETS,...LIVING_ASSETS,'artwork/world/meadow-v1.png','artwork/world/environment-v1.png',...WORLD_BACKGROUNDS.map(background=>background.file),
  'artwork/world/transport/frames.js',...new Set(Object.values(TRANSPORT_FRAMES).map(frame=>frame.file)),
  'artwork/world/sky/frames.js',...Object.values(SKY_ART).map(frame=>frame.file)];
export const WORLD_ROUTE_BASELINES=Object.freeze({
  road:Object.freeze({download:216,upload:250}),
  rail:Object.freeze({download:222,upload:256}),
  water:Object.freeze({download:229,upload:260}),
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
  const width=Math.max(80,extent+24),depth={trail:20,gravel:21,road:22,boulevard:24,highway:26,superhighway:28}[growth.tier];
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
    <g class="world-airport" opacity="${air?1:0}">${guides}${transportScenery('runway',end+22,204,Math.max(80,extent-end-34),9)}</g>
    ${strips(growth.tier,depth,width)}${markers}
    <g class="world-rail" opacity="${rail?1:0}">${strips('rail',8,width)}</g>
    <g class="world-river" opacity="${port?1:0}">${strips('water',23,width)}</g>
  </g>`;
}
export function worldNature(stage,end=655,modes=[]) {
  const growth=infrastructure(stage),extent=end+245,port=growth.port||modes.includes('water'),air=growth.airport||modes.includes('air');
  // Tall props sit behind the contact lines, leaving each moving silhouette clear.
  const trees=Array.from({length:growth.trees},(_,i)=>`<g data-render-key="world-tree-${i}"><g class="living-foliage" style="--nature-delay:-${i*1.9}s">${worldSprite('trees',42+i*(extent-150)/growth.trees,169+(i%2)*7,23+(i%3)*6,30)}</g></g>`).join('');
  const parks=Array.from({length:growth.parks},(_,i)=>`<g data-render-key="world-park-${i}">${worldSprite('park',end+36+i*46,176,36,24)}</g>`).join('');
  const lamps=Array.from({length:growth.lamps},(_,i)=>`<g class="world-lamp" data-render-key="world-lamp-${i}">${worldSprite('lamps',end*.33+i*65,186,18,33)}</g>`).join('');
  const rail=growth.rail||modes.includes('rail');
  const terminal=(mode,x,y,id,visible,width)=>`<g class="freight-terminal ${mode==='water'?'world-port':'world-rail-terminal'}" data-terminal-mode="${mode}" data-render-key="${mode}-terminal" opacity="${visible?1:0}" transform="translate(${x} ${y})"><g class="terminal-art">${logisticsArtwork(id,width,mode==='water'?94:68)}</g>${[0,1,2].map(i=>`<g transform="translate(${-36+i*22} ${mode==='water'?-13:-3})"><g class="terminal-worker" style="--work-delay:-${i*.7}s">${logisticsArtwork('dock-worker',9,16)}</g></g>`).join('')}<g transform="translate(-51 -5)">${logisticsArtwork('forklift',30,22)}</g></g>`;
  return `<g class="world-nature">${trees}${parks}${lamps}<g class="world-air-terminal" opacity="${air?1:0}" data-airport="${growth.spaceport?'spaceport':'airport'}">${transportScenery(growth.spaceport?'spaceport':'airport',end+52,163,88,42)}</g>${terminal('rail',end-20,246,'rail-gantry',rail,85)}${terminal('water',end+144,256,'dock-pier',port,98)}</g>`;
}
function cityStreetLights(stage,extent) {
  const count=2+Math.floor(stage/2);
  return '<g class="world-night-lights night-light" aria-hidden="true">'+Array.from({length:count},(_,i)=>{
    const x=extent*(.12+i*.78/Math.max(1,count-1)),y=i%3===0?202:182;
    return `<g data-render-key="street-light-${i}" transform="translate(${x} ${y})"><path d="M0 0v-30q0 -4 4 -4h4" fill="none" stroke="#8396a7" stroke-width="1.2"/><ellipse cx="9" cy="1" rx="24" ry="4" fill="#ffcd77" opacity=".22"/><path d="M7 -31L-9 0h36L11 -31z" fill="#ffdc91" opacity=".07"/><ellipse class="lamp-halo" cx="9" cy="-31" rx="9" ry="8" fill="#ffd88e" opacity=".15"/><rect class="lamp-bulb" x="5" y="-34" width="8" height="3" rx="1.5" fill="#ffeab6"/></g>`;
  }).join('')+'</g>';
}
// A session seed varies sightings between launches; per-city seeds retain their
// schedules across polling, growth, sorting and responsive layout changes.
const skySessionSeed=Math.floor(Math.random()*0xffffffff);
function skyRandom(key) {
  let seed=skySessionSeed;
  for(const char of String(key))seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}
export function skySprite(id,x,y,width,attributes='') {
  const frame=SKY_ART[id],height=width*frame.size.height/frame.size.width;
  return '<image '+attributes+' href="'+frame.file+'" x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'"/>';
}
// One visitor at a time with fresh random paths and quiet gaps. The paused
// visual clock drives this schedule; polling never creates or restarts a visit.
export class SkySchedule {
  constructor(key,now=0,random=skyRandom(key)) {
    this.random=random;this.nextAt=now+60000+random()*120000;this.event=null;this.previous=null;
  }
  sample(now,night=false) {
    while(now>=this.nextAt) {
      const choices=(night?['drone','drone','ufo']:['birds','birds','birds','kite','kite','drone','drone','ufo']).filter(kind=>kind!==this.previous);
      const kind=choices[Math.floor(this.random()*choices.length)];
      this.event={kind,start:this.nextAt,duration:18000+this.random()*10000,direction:this.random()>.5?1:-1,y:3+this.random()*20,bend:(this.random()-.5)*6};
      this.previous=kind;this.nextAt=this.event.start+this.event.duration+150000+this.random()*300000;
    }
    const event=this.event;
    return event&&now<event.start+event.duration?{...event,progress:clamp((now-event.start)/event.duration)}:null;
  }
}
const skyWidths={birds:44,kite:15,drone:25,ufo:25};
export function drawSkySighting(svg,now,schedule) {
  const event=schedule.sample(now,svg.dataset.time==='night');
  for(const node of svg.querySelectorAll('.sky-visitor')) {
    const visible=event?.kind===node.dataset.skyKind;
    node.style.opacity=visible?String(Math.min(.78,event.progress*12,(1-event.progress)*12)):0;
    if(!visible)continue;
    // Departure geometry stays stable through responsive layout changes.
    event.extent=schedule.event.extent??=(Number(svg.dataset.sceneEnd)||655)+245;
    const p=event.direction===1?event.progress:1-event.progress;
    const x=-40+(event.extent+80)*p,y=event.y+Math.sin(Math.PI*event.progress)*event.bend;
    node.setAttribute('transform','translate('+x.toFixed(3)+' '+y.toFixed(3)+')');
    node.querySelector('.sky-facing').setAttribute('transform','scale('+event.direction+' 1)');
  }
}
export function worldSky(stage,end=655,key='catalog') {
  const extent=end+245,random=skyRandom(key);
  const visitors=Object.keys(skyWidths).map(kind=>'<g class="sky-visitor world-'+kind+'" data-render-key="sky-'+kind+'" data-sky-kind="'+kind+'"><g class="sky-bob"><g class="sky-facing">'+skySprite(kind,-skyWidths[kind]/2,-skyWidths[kind]*SKY_ART[kind].size.height/SKY_ART[kind].size.width/2,skyWidths[kind])+'</g></g></g>').join('');
  return '<rect class="world-time-wash" x="0" y="-20" width="'+extent+'" height="280" fill="#18325c"/><g class="world-sky" aria-hidden="true"><g transform="translate('+extent*.26+' -5)"><g class="world-cloud" style="--cloud-delay:-'+(random()*65).toFixed(2)+'s">'+skySprite('cloud',-40,-7,80)+'</g></g>'+visitors+
    '<g class="world-sun" transform="translate('+extent*.75+' 12)">'+skySprite('sun',-9,-9,18)+'</g><g class="world-moon" transform="translate('+extent*.75+' 12)">'+skySprite('moon',-8,-9,16)+'</g>'+
    '<g class="world-stars">'+Array.from({length:40},(_,i)=>skySprite('star',(15+random()*(extent-30)).toFixed(2),(-16+random()*48).toFixed(2),i%5===0?2.6:1.7,'class="sky-star" data-render-key="star-'+i+'" style="--star-delay:-'+(random()*7).toFixed(2)+'s"')).join('')+'</g></g>'+cityStreetLights(stage,extent);
}
export function worldBackdrop(stage=0) {
  return livingBackdrop(Math.max(0,Math.min(19,Math.floor(stage)||0)));
}
export function updateWorldTime(svg,date=new Date()) {
  const time=worldTime(date);
  if(svg.dataset.time!==time.phase)svg.dataset.time=time.phase;
  const sun=svg.querySelector('.world-sun'),extent=(Number(svg.dataset.sceneEnd)||655)+245;
  if(sun) {const daylight=clamp((time.hour-5)/15);sun.setAttribute('transform','translate('+extent*(.17+.65*daylight)+' '+(45-50*Math.sin(Math.PI*daylight))+')');}
  const label=svg.closest('.city-detail-card')?.querySelector('.city-world-clock');
  if(label) {label.textContent=`${time.phase==='sunrise'?'Sunrise':time.phase==='sunset'?'Sunset':time.phase==='night'?'Night':'Day'} · ${time.label}`;label.title='Scenery follows your local clock · sunrise 05–08, day 08–17, sunset 17–20, night 20–05';}
}
// Both the HTML readings and vehicles use this exact route baseline.
export function laneLabelPosition(type,direction) {
  const mode=transportSpec(type).mode;
  return (WORLD_ROUTE_BASELINES[mode][direction]+20)/280*100;
}
export function layoutWorld(svg,end,patch=(node,markup)=>{node.innerHTML=markup;}) {
  const stage=Number(svg.dataset.stage)||0;
  const terrain=svg.querySelector('.world-terrain');
  if(terrain&&!terrain.classList.contains('living-ground')&&terrain.getAttribute('href')!==worldBackground(stage)) {
    terrain.setAttribute('href',worldBackground(stage));
    terrain.dataset.backgroundStage=stage;
  }
  const modes=[svg.dataset.downloadType,svg.dataset.uploadType].map(type=>transportSpec(type).mode);
  const replace=(selector,markup)=>{const target=svg.querySelector(selector);if(target)patch(target,markup);};
  replace('.world-infrastructure',worldRoads(stage,end,modes));
  replace('.world-decoration',worldNature(stage,end,modes));
  replace('.world-atmosphere',worldSky(stage,end,svg.dataset.cityKey));
  if(svg.querySelector('.living-diorama'))layoutLivingCity(svg,end);
  else {
    svg.querySelector('.world-city')?.setAttribute('transform',`translate(${end-80} 28)`);
    svg.querySelector('.world-city .city-buildings')?.setAttribute('transform',settlementTransform(end,stage));
    layoutSettlementActivity(svg,end);
  }
  for(const direction of ['download','upload']) {
    const label=svg.parentElement.querySelector('.route-speeds .'+direction+'-rate');
    if(label)label.style.setProperty('--lane-y',laneLabelPosition(svg.dataset[direction+'Type'],direction)+'%');
  }
  for(const node of svg.querySelectorAll('.world-terrain,.world-time-wash'))node.setAttribute('width',end+245);
}

import {CITY_ART,FLEET_ART,PROP_ART,CONSTRUCTION_ART,DETAIL_ART} from './artwork/manifest.js';
export {CITY_ART,FLEET_ART,PROP_ART,CONSTRUCTION_ART,DETAIL_ART,ILLUSTRATION_ASSETS} from './artwork/manifest.js';
export const CITY_ART_IDS=['shack','cabin','house','homestead','mansion','estate','neighborhood','suburb','village','town','city','regional-city','metropolis','capital','megacity','green-megacity','smart-metropolis','arcology','orbital-gateway','space-age-metropolis'];

// Clip the original transparent PNG directly; share it across live journeys.
function sprite(folder,id,art,variant,width,baseline=11,maxHeight=Infinity) {
  const [x,y,w,h]=art.frames[variant],padding=2;
  const scale=Math.min(width/(w+padding*2),maxHeight/(h+padding*2));
  const displayWidth=(w+padding*2)*scale,displayHeight=(h+padding*2)*scale;
  const image=`<image href="artwork/${folder}/${id}.png" width="${art.size[0]}" height="${art.size[1]}"/>`;
  const clip=art.clips?.[variant];
  const contents=clip?`<svg x="${clip[0]}" y="${clip[1]}" width="${clip[2]}" height="${clip[3]}" viewBox="${clip.join(' ')}" overflow="hidden">${image}</svg>`:image;
  return `<svg x="${-displayWidth/2}" y="${baseline-displayHeight}" width="${displayWidth}" height="${displayHeight}" viewBox="${x-padding} ${y-padding} ${w+padding*2} ${h+padding*2}" overflow="hidden">${contents}</svg>`;
}

export function illustratedVehicle(spec,appearance) {
  const art=FLEET_ART[spec.id],variant=appearance%art.frames.length;
  const height=spec.mode==='air'?46:spec.mode==='road'?33:42;
  const loaded=sprite('fleet',spec.id,art,variant,spec.width-2,11,height);
  return art.empty?{body:sprite('fleet',spec.id+'-empty',art.empty,variant,spec.width-2,11,height),cargo:loaded}:{body:loaded,cargo:''};
}
export function illustratedCity(stage) {
  const id=CITY_ART_IDS[stage],art=CITY_ART[id];
  const width=stage<3?123+stage*13:stage<6?170+(stage-3)*13:264;
  return `<g class="city-buildings" transform="translate(157 0)">${sprite('cities',id,art,0,width,129,145)}</g>`;
}
export function illustratedWorker({woman=false,carry=false,size=8}={}) {
  const variant=carry?0:woman?2:1;
  return `<g class="helper-person illustrated-person">${sprite('fleet','crew',PROP_ART.crew,variant,size,0,size*1.75)}</g>`;
}
export function illustratedProp(id,width,baseline=0,maxHeight=Infinity) {
  return sprite('fleet',id,PROP_ART[id],0,width,baseline,maxHeight);
}

export function illustratedConstructionVehicle(id,appearance=0) {
  const art=CONSTRUCTION_ART[id],variant=Math.abs(Math.floor(appearance))%art.frames.length;
  return `<g class="illustrated-site-machine" data-machine="${id}" data-paint="${variant}">${sprite('construction',id,art,variant,id==='excavator'?43:39,0,30)}</g>`;
}

export function illustratedDetail(id,width,baseline=0,maxHeight=Infinity,frame=0) {
  return sprite('details',id,DETAIL_ART[id],frame,width,baseline,maxHeight);
}

// Decorative spots have empty alt text; nearby headings carry their meaning.
export function illustratedSpot(id,className='',size=72,frame=0) {
  if(DETAIL_ART[id].frames.length>1)return `<svg class="illustrated-spot ${className}" width="${size}" height="${size}" viewBox="${-size/2} ${-size} ${size} ${size}" aria-hidden="true">${illustratedDetail(id,size,0,size,frame)}</svg>`;
  return `<img class="illustrated-spot ${className}" src="/artwork/details/${id}.png" width="${size}" height="${size}" alt="" decoding="async">`;
}

export function illustratedBuilding(house,progress,width,maxHeight) {
  const id=house?'house-build':'tower-build',phase=Math.min(3,Math.max(0,progress)*4);
  // Keep all four phases connected during polling; aligned viewports prevent jumps.
  return DETAIL_ART[id].frames.map((_,frame)=>`<g class="construction-phase" data-render-key="phase-${frame}" opacity="${Math.max(0,1-Math.abs(phase-frame))}">${illustratedDetail(id,width,0,maxHeight,frame)}</g>`).join('');
}

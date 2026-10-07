import {CITY_ART,FLEET_ART,PROP_ART} from './artwork/manifest.js';
export {CITY_ART,FLEET_ART,PROP_ART,ILLUSTRATION_ASSETS} from './artwork/manifest.js';
export const CITY_ART_IDS=['shack','cabin','house','homestead','mansion','estate','neighborhood','suburb','village','town','city','regional-city','metropolis','capital','megacity','green-megacity','smart-metropolis','arcology','orbital-gateway','space-age-metropolis'];

// Clip the original transparent PNG directly; share it across live journeys.
function sprite(folder,id,art,variant,width,baseline=11,maxHeight=Infinity) {
  const [x,y,w,h]=art.frames[variant],padding=2;
  const scale=Math.min(width/(w+padding*2),maxHeight/(h+padding*2));
  const displayWidth=(w+padding*2)*scale,displayHeight=(h+padding*2)*scale;
  return `<svg x="${-displayWidth/2}" y="${baseline-displayHeight}" width="${displayWidth}" height="${displayHeight}" viewBox="${x-padding} ${y-padding} ${w+padding*2} ${h+padding*2}" overflow="hidden"><image href="artwork/${folder}/${id}.png" width="${art.size[0]}" height="${art.size[1]}"/></svg>`;
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
export function illustratedWorker({woman=false,carry=false}={}) {
  const variant=carry?0:woman?2:1;
  return `<g class="helper-person illustrated-person">${sprite('fleet','crew',PROP_ART.crew,variant,8,0,14)}</g>`;
}
export function illustratedProp(id,width,baseline=0,maxHeight=Infinity) {
  return sprite('fleet',id,PROP_ART[id],0,width,baseline,maxHeight);
}

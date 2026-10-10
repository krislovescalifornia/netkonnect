import {CITY_ART,FLEET_ART,PROP_ART,CONSTRUCTION_ART,DETAIL_ART,ILLUSTRATION_ASSETS as SOURCE_ASSETS} from './artwork/manifest.js';
export {CITY_ART,FLEET_ART,PROP_ART,CONSTRUCTION_ART,DETAIL_ART} from './artwork/manifest.js';
export const CITY_ART_IDS=['shack','cabin','house','homestead','mansion','estate','neighborhood','suburb','village','town','city','regional-city','metropolis','capital','megacity','green-megacity','smart-metropolis','arcology','orbital-gateway','space-age-metropolis'];


export const ACTIVITY_ASSETS=[...PROP_ART.crew.frames.map((_,i)=>'artwork/fleet/activity/crew-'+i+'.png'),...Object.entries(CONSTRUCTION_ART).flatMap(([id,art])=>art.frames.map((_,i)=>'artwork/construction/activity/'+id+'-'+i+'.png'))];
export const FLEET_TEXTURE_ASSETS=Object.entries(FLEET_ART).flatMap(([id,art])=>art.frames.flatMap((_,i)=>[`artwork/fleet/traffic/${id}-${i}.png`,...(art.empty?[`artwork/fleet/traffic/${id}-empty-${i}.png`]:[])]));
export const ILLUSTRATION_ASSETS=[...SOURCE_ASSETS,...ACTIVITY_ASSETS,...FLEET_TEXTURE_ASSETS];
// Match atlas padding and proportions; isolate textures for frequent work poses.
function activitySprite(folder,id,art,variant,width,baseline,maxHeight) {
  const [,,w,h]=art.frames[variant],scale=Math.min(width/(w+4),maxHeight/(h+4));
  const displayWidth=(w+4)*scale,displayHeight=(h+4)*scale;
  return `<image href="artwork/${folder}/activity/${id}-${variant}.png" x="${-displayWidth/2}" y="${baseline-displayHeight}" width="${displayWidth}" height="${displayHeight}"/>`;
}

// Clip the original transparent PNG directly; share it across live journeys.
function sprite(folder,id,art,variant,width,baseline=11,maxHeight=Infinity) {
  const [x,y,w,h]=art.frames[variant],padding=2;
  const scale=Math.min(width/(w+padding*2),maxHeight/(h+padding*2));
  const displayWidth=(w+padding*2)*scale,displayHeight=(h+padding*2)*scale;
  const image=`<image href="artwork/${folder}/${id}.png" width="${art.size[0]}" height="${art.size[1]}"/>`;
  const clip=art.clips?.[variant];
  // The crane atlas includes a painted fixed hook/crate. Keep the mast and boom,
  // excluding that fixed rig so the live cable and load form one attached hoist.
  const crane=id==='crane'?`<svg x="0" y="0" width="1024" height="315" viewBox="0 0 1024 315" overflow="hidden">${image}</svg><svg x="0" y="315" width="700" height="1221" viewBox="0 315 700 1221" overflow="hidden">${image}</svg>`:image;
  const contents=clip?`<svg x="${clip[0]}" y="${clip[1]}" width="${clip[2]}" height="${clip[3]}" viewBox="${clip.join(' ')}" overflow="hidden">${image}</svg>`:crane;
  return `<svg x="${-displayWidth/2}" y="${baseline-displayHeight}" width="${displayWidth}" height="${displayHeight}" viewBox="${x-padding} ${y-padding} ${w+padding*2} ${h+padding*2}" overflow="hidden">${contents}</svg>`;
}

export function illustratedVehicle(spec,appearance) {
  const art=FLEET_ART[spec.id],variant=appearance%art.frames.length;
  const height=spec.mode==='air'?46:spec.mode==='road'?33:42;
  const texture=(id,strip)=>{
    const [,,w,h]=strip.frames[variant],scale=Math.min((spec.width-2)/(w+4),height/(h+4));
    const width=(w+4)*scale,displayHeight=(h+4)*scale;
    return `<image data-art-source="artwork/fleet/${id}.png" href="artwork/fleet/traffic/${id}-${variant}.png" x="${-width/2}" y="${11-displayHeight}" width="${width}" height="${displayHeight}"/>`;
  };
  const loaded=texture(spec.id,art);
  return art.empty?{body:texture(spec.id+'-empty',art.empty),cargo:loaded}:{body:loaded,cargo:''};
}
export function illustratedCity(stage) {
  const id=CITY_ART_IDS[stage],art=CITY_ART[id];
  const width=stage<3?123+stage*13:stage<6?170+(stage-3)*13:264;
  return `<g class="city-buildings" transform="translate(157 0)">${sprite('cities',id,art,0,width,129,145)}</g>`;
}
export function illustratedWorker({woman=false,carry=false,size=8}={}) {
  const variant=carry?0:woman?2:1;
  return `<g class="helper-person illustrated-person">${activitySprite('fleet','crew',PROP_ART.crew,variant,size,0,size*1.75)}</g>`;
}
export function illustratedProp(id,width,baseline=0,maxHeight=Infinity) {
  return sprite('fleet',id,PROP_ART[id],0,width,baseline,maxHeight);
}

export function craneHoistGeometry(height) {
  const [x,y,w,h]=PROP_ART.crane.frames[0],scale=Math.min(height*.65/(w+4),height/(h+4));
  // Authored trolley contact at (820, 310) in the original crane pixels.
  return {x:-(w+4)*scale/2+(820-x+2)*scale,y:126-(h+4)*scale+(310-y+2)*scale,
    rest:height*.43,lift:height*.05,loadHeight:height*.24,loadWidth:height*.11};
}

export function illustratedConstructionVehicle(id,appearance=0) {
  const art=CONSTRUCTION_ART[id],variant=Math.abs(Math.floor(appearance))%art.frames.length;
  return `<g class="illustrated-site-machine" data-machine="${id}" data-paint="${variant}">${activitySprite('construction',id,art,variant,id==='excavator'?43:52,0,30)}</g>`;
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

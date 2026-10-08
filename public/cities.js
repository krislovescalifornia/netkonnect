import {illustratedCity,illustratedWorker,illustratedProp,illustratedConstructionVehicle,illustratedBuilding,illustratedDetail} from './illustration-art.js';
import {worldBackdrop,worldRoads,worldNature,worldSky,worldTime,infrastructure} from './world.js';
// Illustrated architecture with independent live supply and crew layers.
// These are measured-byte milestones; animation never manufactures usage.
const MB=1024**2, GB=1024**3, TB=1024**4;
export const CITY_STAGES=[
  {name:'Shack',at:0}, {name:'Cabin',at:16*MB}, {name:'House',at:64*MB},
  {name:'Homestead',at:128*MB}, {name:'Mansion',at:512*MB}, {name:'Estate',at:GB},
  {name:'Neighborhood',at:2*GB}, {name:'Suburb',at:4*GB}, {name:'Village',at:8*GB},
  {name:'Town',at:16*GB}, {name:'City',at:32*GB}, {name:'Regional city',at:64*GB},
  {name:'Metropolis',at:128*GB}, {name:'Capital',at:256*GB}, {name:'Megacity',at:512*GB},
  {name:'Green megacity',at:TB}, {name:'Smart metropolis',at:2*TB},
  {name:'Arcology',at:4*TB}, {name:'Orbital gateway',at:8*TB}, {name:'Space-age metropolis',at:16*TB}
];
export function cityStage(bytes) {
  if(!Number.isFinite(bytes))return {index:0,name:'Awaiting measured data',progress:0,known:false};
  bytes=Math.max(0,bytes);
  const index=CITY_STAGES.findLastIndex(s=>bytes>=s.at),stage=CITY_STAGES[index];
  const next=CITY_STAGES[index+1];
  return {index:Math.max(0,index),name:stage.name,known:true,progress:next?Math.max(0,Math.min(1,(bytes-stage.at)/(next.at-stage.at))):1,next:next?.name,nextAt:next?.at};
}
export function worker(options={}) {
  return illustratedWorker(options);
}
export function cityHelpers(stage) {
  return Array.from({length:Math.floor(stage/2)},(_,i)=>`<g data-helper="${i}" transform="translate(${48+(i*23)%165} ${i%2?138:134})"><g class="crew-walker" style="--walk-distance:${24+(i%3)*10}px;--walk-duration:${9+i%4}s;--walk-delay:-${i*1.7}s">${worker({woman:i%2===0,carry:i%3===0})}</g></g>`).join('');
}
const clamp=n=>Math.max(0,Math.min(1,n));
const PHASES=['Foundations','Framing','Building floors','Finishing','Complete'];
export function cityConstruction(stage,progress=0) {
  stage=Math.max(0,Math.min(CITY_STAGES.length-1,Math.floor(stage)||0));
  progress=Number.isFinite(progress)?clamp(progress):0;
  if(stage===CITY_STAGES.length-1)progress=1;
  const count=stage<3?2:stage<6?3:stage<10?4:stage<14?5:6;
  const sites=Array.from({length:count},(_,i)=>{
    const built=progress===1?1:clamp(progress*1.4-i/(count-1)*.4);
    return {built,phase:PHASES[built===1?4:Math.min(3,Math.floor(built*4))],
      x:stage<6?105+i*49:40+i*244/(count-1),
      height:stage<6?24+i%2*8:stage<10?34+i%3*9:48+i%3*14,
      house:stage<8||i===count-1};
  });
  return {progress,sites,cranes:stage<2?0:Math.min(6,1+Math.floor((stage-2)/3)),vehicles:stage<3?1:stage<10?2:3,
    phase:PHASES[progress===1?4:Math.min(3,Math.floor(progress*4))]};
}

function buildingSite(site,i) {
  const {built,x,height,house}=site,width=house?36:42;
  const platform=Math.min(height-4,height*(.18+.82*built));
  return `<g class="city-project" data-render-key="project-${i}" data-build-progress="${built.toFixed(4)}" data-build-phase="${site.phase}" opacity="${1-clamp((built-.86)/.14)}" transform="translate(${x+12} 128)">
    <title>${house?'House':'Tower'} · ${site.phase.toLowerCase()}</title>
    <g class="building-illustration">${illustratedBuilding(house,built,width,height+12)}</g>
    <g class="site-scaffolding" opacity="${1-clamp((built-.84)/.16)}">
      <g transform="translate(${width*.35} -${platform})"><g class="crew-builder" style="animation-delay:-${i*.7}s">${worker({woman:i%2===0})}</g></g>
    </g>
  </g>`;
}

function siteVehicle(i,stage) {
  // Render original imagegen pixels; paint choices stay stable across updates.
  const id=i===1?'cement-mixer':'excavator';
  return `<g data-render-key="site-vehicle-${i}" transform="translate(${i===0?59:i===1?172:242} ${i===1?145:142})">
    <g class="site-vehicle" style="--machine-delay:-${i*3}s;--machine-direction:${i===2?-1:1}">
      <g transform="scale(${i===2?-1:1} 1)">${illustratedConstructionVehicle(id,stage+i)}</g>
    </g>
  </g>`;
}

export function cityArtwork(stage,progress=0,sceneKey='catalog') {
  const build=cityConstruction(stage,progress),next=Math.min(stage+1,CITY_STAGES.length-1);
  const clipId='city-rise-'+stage+'-'+encodeURIComponent(sceneKey).replace(/%/g,'_');
  const cranes=Array.from({length:build.cranes},(_,i)=>{
    const x=build.cranes===1?286:42+i*244/(build.cranes-1),height=61+(i%3)*21;
    return `<g class="site-crane" data-render-key="crane-${i}" transform="translate(${x} 0)" style="--hoist-delay:-${i*2.3}s;--hoist-duration:${9+i%3*2}s">
      ${illustratedProp('crane',height*.65,126,height)}
      <g transform="translate(12 ${119-height*.55})"><g class="crane-load">${illustratedDetail('crane-load',10,6,22)}</g></g>
    </g>`;
  }).join('');
  return `<g class="city-linework" fill="none" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <g class="city-buildings">
      <g class="city-established" opacity="${stage===next?1:1-build.progress*.95}">${illustratedCity(stage).replace('class="city-buildings"','class="city-illustration"')}</g>
      <defs><clipPath id="${clipId}">${build.sites.map((site,i)=>`<rect x="${i*330/build.sites.length}" y="${129-145*site.built}" width="${330/build.sites.length+.5}" height="${145*site.built}"/>`).join('')}</clipPath></defs>
      <g class="city-rising" clip-path="url(#${clipId})" opacity="${stage===next?0:clamp(build.progress*5)}">${illustratedCity(next).replace('class="city-buildings"','class="city-illustration"')}</g>
    </g>
    <g class="construction-site">${cranes}</g>
    <g class="city-projects">${build.sites.map(buildingSite).join('')}</g>
    <g class="city-site-vehicles">${Array.from({length:build.vehicles},(_,i)=>siteVehicle(i,stage)).join('')}</g>
    <g class="site-supplies" transform="translate(267 139)"><g transform="translate(5 0)">${illustratedDetail('site-supplies',34,0,15)}</g></g>
    <g transform="translate(292 135)"><g class="crew-carrier">${worker({woman:true,carry:true})}</g></g>
    <g transform="translate(258 135)"><g class="crew-builder">${worker()}</g></g>
    <g transform="translate(85 135)"><g class="crew-receiver">${worker({woman:true})}</g></g>
    <g class="city-helpers">${cityHelpers(stage)}</g>
    <g class="city-airdrop">${illustratedProp('airdrop',25,39,39)}</g>
  </g>`;
}
// Shared by the initial SVG and the animator's responsive layout.
export const CITY_ROUTE_SCENE=Object.freeze({height:280});

// Within a tier, only growth measurements change. Keep the illustrated SVGs
// and animated crews in place instead of generating/parsing them every poll.
export function updateCityGrowth(svg,stage,progress) {
  const build=cityConstruction(stage,progress),final=stage===CITY_STAGES.length-1;
  const set=(node,name,value)=>{const text=String(value);if(node.getAttribute(name)!==text)node.setAttribute(name,text);};
  set(svg.querySelector('.city-established'),'opacity',final?1:1-build.progress*.95);
  set(svg.querySelector('.city-rising'),'opacity',final?0:clamp(build.progress*5));
  const clips=svg.querySelectorAll('.city-buildings clipPath rect'),projects=svg.querySelectorAll('.city-project');
  build.sites.forEach((site,i)=>{
    set(clips[i],'y',129-145*site.built);set(clips[i],'height',145*site.built);
    const project=projects[i],platform=Math.min(site.height-4,site.height*(.18+.82*site.built));
    set(project,'data-build-progress',site.built.toFixed(4));set(project,'data-build-phase',site.phase);
    set(project,'opacity',1-clamp((site.built-.86)/.14));
    const title=project.querySelector('title'),label=`${site.house?'House':'Tower'} · ${site.phase.toLowerCase()}`;
    if(title.textContent!==label)title.textContent=label;
    const scaffold=project.querySelector('.site-scaffolding');
    set(scaffold,'opacity',1-clamp((site.built-.84)/.16));
    set(scaffold.firstElementChild,'transform',`translate(${(site.house?36:42)*.35} -${platform})`);
    const phase=Math.min(3,site.built*4);
    project.querySelectorAll('.construction-phase').forEach((node,frame)=>set(node,'opacity',Math.max(0,1-Math.abs(phase-frame))));
  });
}

export function renderCity({key,bytes,busy=false,airdrop=false,convoy='',trafficLabel='',includeArtwork=true,date=new Date()}) {
  const stage=cityStage(bytes);
  const build=cityConstruction(stage.index,stage.progress);
  // key is escaped by the caller; stage names and geometry are internal constants.
  const scene=CITY_ROUTE_SCENE;
  const end=655,growth=infrastructure(stage.index);
  const world=convoy?`${worldBackdrop(stage.index)}<g class="world-infrastructure">${worldRoads(stage.index,end)}</g><g class="world-city" transform="translate(${end-80} 28)">${includeArtwork?cityArtwork(stage.index,stage.progress,key):''}</g><g class="world-decoration">${worldNature(stage.index,end)}</g><g class="world-atmosphere">${worldSky(stage.index,end)}</g>`:includeArtwork?cityArtwork(stage.index,stage.progress,key):'';
  return `<svg class="application-city ${convoy?'convoy-svg city-route-scene ':''}${busy?'city-working':'city-resting'} ${airdrop?'has-airdrop':''} ${stage.known?'':'city-unmeasured'}" data-city-key="${key}" data-stage="${stage.index}" data-progress="${stage.progress}" data-build-phase="${build.phase}" data-time="${worldTime(date).phase}" data-infrastructure="${growth.tier}" ${convoy} viewBox="${convoy?`0 -20 900 ${scene.height}`:'0 -20 330 178'}" role="img" aria-label="${stage.name}; ${stage.known?(stage.next?build.phase.toLowerCase()+' toward '+stage.next:'construction complete'):'awaiting measured supplies'}; ${growth.name.toLowerCase()}; ${busy?'construction crew working':'crew resting'}${trafficLabel?'; '+trafficLabel:''}">${world}</svg>`;
}

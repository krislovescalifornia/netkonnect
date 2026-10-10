import {illustratedCity,illustratedWorker,illustratedProp,illustratedConstructionVehicle,craneHoistGeometry} from './illustration-art.js';
import {illustratedSettlement,settlementTransform,illustratedResident,settlementHeight} from './settlement-art.js';
import {worldBackdrop,worldRoads,worldNature,worldSky,worldTime,infrastructure} from './world.js';
import {projectArtwork,PROJECT_NAMES,materialArtwork,deliveryMaterial,logisticsArtwork} from './construction-art.js';
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
export function cityHelpers(stage,landscape=false) {
  return Array.from({length:3+Math.floor(stage/2)},(_,i)=>`<g data-helper="${i}"${landscape?` class="city-activity-anchor" data-city-x="${48+(i*23)%165}" data-city-y="${i%2?78:103}"`:""} transform="translate(${48+(i*23)%165} ${i%2?138:134})"><g class="crew-walker" style="--walk-distance:${24+(i%3)*10}px;--walk-duration:${9+i%4}s;--walk-delay:-${i*1.7}s">${worker({woman:i%2===0,carry:i%3===0,size:landscape?9:8})}</g></g>`).join('');
}
export function cityResidents(stage) {
  const count=Math.min(30,8+Math.max(0,stage));
  return `<g class="city-residents"><path class="city-footpath" data-footpath-y="76" d="M0 76H330"/><path class="city-footpath" data-footpath-y="104" d="M0 104H330"/>${Array.from({length:count},(_,i)=>`<g class="city-activity-anchor resident-home" data-render-key="resident-${i}" data-city-x="${20+i*290/(count-1)}" data-city-y="${i%2?76:104}" data-city-scale="${i%2?.85:1}" transform="translate(${20+i*290/(count-1)} ${i%2?76:104})"><g class="resident-walk" style="--walk-distance:${20+i%3*10}px;--walk-duration:${10+i%5}s;--walk-delay:-${i*1.3}s;--stride-delay:-${i*.17}s"><g class="resident-facing">${illustratedResident(i)}</g></g></g>`).join('')}</g>`;
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
      house:stage<8||i===count-1,design:i===count-1&&stage>=8?Math.min(7,stage-i):Math.max(0,stage-i),
      material:deliveryMaterial(stage,i),width:stage<4?48:stage<8?59:stage<12?62:stage<17?58:70};
  });
  return {progress,sites,cranes:stage<2?0:Math.min(6,1+Math.floor((stage-2)/3)),vehicles:stage<3?2:stage<10?4:6,
    phase:PHASES[progress===1?4:Math.min(3,Math.floor(progress*4))]};
}

function buildingSite(site,i,landscape=false,baseline=landscape?88:128) {
  const {built,x,height,house,design}=site,width=site.width;
  const platform=Math.min(height-4,height*(.18+.82*built));
  return `<g class="city-project${landscape?' city-activity-anchor':''}"${landscape?` data-city-x="${x+12}" data-city-y="${baseline}"`:""} data-render-key="project-${i}" data-build-progress="${built.toFixed(4)}" data-build-phase="${site.phase}" opacity="${1-clamp((built-.86)/.14)}" transform="translate(${x+12} ${baseline})">
    <title>${PROJECT_NAMES[design]} · ${site.phase.toLowerCase()}</title>
    <g class="building-illustration" data-project-design="${design}">${projectArtwork(design,built,width,height+20)}</g>
    <g class="site-window-lights"><g opacity="${clamp((built-.55)/.35)}" fill="#ffdb83" stroke="none">${Array.from({length:house?2:6},(_,j)=>`<rect x="${-width*.18+j%2*width*.22}" y="${-9-Math.floor(j/2)*8}" width="3" height="4" rx=".5"/>`).join('')}</g></g>
    <g class="site-scaffolding" opacity="${1-clamp((built-.84)/.16)}">
      <g transform="translate(${width*.35} -${platform})"><g class="crew-builder" style="animation-delay:-${i*.7}s">${worker({woman:i%2===0,size:9})}</g></g>
    </g>
  </g>`;
}

function siteVehicle(i,stage,landscape=false,withinYard=false) {
  // Render original imagegen pixels; paint choices stay stable across updates.
  const id=i%3===1?'cement-mixer':'excavator';
  const x=withinYard?0:35+i*250/Math.max(1,cityConstruction(stage).vehicles-1);
  return `<g data-render-key="site-vehicle-${i}"${landscape?` class="city-activity-anchor" data-city-x="${x}" data-city-y="${i%2?101:97}"`:""} transform="translate(${x} ${withinYard?0:i===1?145:142})">
    <g class="site-vehicle" style="--machine-delay:-${i*3}s;--machine-direction:${i%2?-1:1}">
      <g class="machine-facing" transform="scale(${withinYard?1:i%2?-1:1} 1)">${illustratedConstructionVehicle(id,stage+i)}</g>
      <g class="machine-beacon night-light" transform="translate(-7 -24)"><circle class="beacon-flash" r="2.2" fill="#ffbc48" stroke="none"/></g>
    </g>
  </g>`;
}


function cityWorksites(build,landscape,withinYard=false,indexOffset=0) {
  return '<g class="city-worksites">'+build.sites.map((site,i)=>{
    i+=indexOffset;
    const x=withinYard?0:site.x+12,y=withinYard?0:landscape?96:140;
    return `<g class="worksite-home${landscape?' city-activity-anchor':''}" data-render-key="worksite-${i}"${landscape?` data-city-x="${x}" data-city-y="${y}"`:''} transform="translate(${x} ${y})" opacity="${1-clamp((site.built-.86)/.14)}" style="--work-delay:-${i*1.3}s;--walk-duration:${6+i%3}s;--walk-delay:-${i*1.7}s;--walk-distance:${28+i%3*9}px">
      <g class="worksite-light night-light" stroke="none"><ellipse cx="0" cy="-9" rx="28" ry="23" fill="#ffcc78" opacity=".12"/><ellipse cx="0" cy="0" rx="27" ry="4" fill="#ffdb94" opacity=".26"/><path d="M-22 0v-26m-4 0h8" stroke="#aebec8" stroke-width="1.3"/><path d="M-24 -26l7 0 16 22-36 0z" fill="#ffe4a3" opacity=".12"/><rect x="-26" y="-28" width="8" height="3" rx="1" fill="#ffe9b8"/></g>
      <g class="worksite-hauler"><g class="crew-walker">${worker({woman:i%2===0,carry:true,size:9})}</g></g>
      <g transform="translate(17 -2)"><g class="crew-builder">${logisticsArtwork('bricklayer',12,18)}</g><g class="worksite-sparks" fill="#fff1a8" stroke="#ffd270" stroke-width=".7"><path d="M-5 -9l-4 -4m7 4l2 -5m-3 8l5 1"/></g></g>
      <g class="worksite-dust" fill="#dac4a0" stroke="none"><circle cx="0" cy="-3" r="4"/><circle cx="6" cy="-2" r="3"/><circle cx="-5" cy="-2" r="2.5"/></g>
    </g>`;
  }).join('')+'</g>';
}

// Work yards are staggered into the settlement at three depths. Each machine
// follows a supply-to-foundation circuit within its yard, above the data road.
function cityDistricts(build,stage) {
  return '<g class="city-districts">'+[0,1,2].map(depth=>`<g class="city-depth-layer" data-render-key="district-depth-${depth}" data-depth="${depth}">${build.sites.map((site,i)=>{
    if(i%3!==depth)return '';
    const y=[60,80,102][depth],scale=[.78,.9,1][depth];
    return `<g class="construction-yard city-activity-anchor" data-render-key="yard-${i}" data-city-x="${site.x+12}" data-city-y="${y}" data-city-scale="${scale}" data-site-count="${build.sites.length}" opacity="${1-clamp((site.built-.86)/.14)}" transform="translate(${site.x+12} ${y}) scale(${scale})" style="--yard-span:44px;--machine-duration:${13+i*1.7}s;--machine-delay:-${i*3}s">
      <path class="yard-ground" d="M-54 7L-37 -24H59L78 7Z"/>
      <path class="yard-track" d="M-31 4L-12 -15H37L52 -4"/>
      <g class="city-projects">${buildingSite({...site,x:18},i,false,-12)}</g>
      <g class="site-stock" data-render-key="stock-${i}" transform="translate(-30 -12)"></g>
      ${cityWorksites({sites:[site]},false,true,i)}
      <g class="city-site-vehicles">${Array.from({length:i<build.vehicles?1:0},()=>siteVehicle(i,stage,false,true)).join('')}${i===build.sites.length-1&&build.vehicles>build.sites.length?`<g transform="translate(-35 -16) scale(.85)">${siteVehicle(build.vehicles-1,stage,false,true)}</g>`:''}</g>
    </g>`;
  }).join('')}</g>`).join('')+'</g>';
}

export function cityArtwork(stage,progress=0,sceneKey='catalog',landscape=false,end=655) {
  const cityImage=landscape?illustratedSettlement:illustratedCity;
  const person=options=>worker({...options,size:landscape?9:8});
  const anchor=(x,y)=>landscape?` class="city-activity-anchor" data-city-x="${x}" data-city-y="${y}"`:'';
  const build=cityConstruction(stage,progress),next=Math.min(stage+1,CITY_STAGES.length-1);
  const growthHeight=landscape?settlementHeight(next):145;
  const clipId='city-rise-'+stage+'-'+encodeURIComponent(sceneKey).replace(/%/g,'_');
  const cranes=Array.from({length:build.cranes},(_,i)=>{
    const x=build.cranes===1?286:42+i*244/(build.cranes-1),height=61+(i%3)*21;
    const rig=craneHoistGeometry(height);
    return `<g class="site-crane${landscape?' city-activity-anchor':''}"${landscape?` data-city-x="${x}" data-city-y="-38"`:""} data-render-key="crane-${i}" transform="translate(${x} 0)" style="--hoist-delay:-${i*2.3}s;--hoist-duration:${6+i%3*1.5}s;--hoist-rest:${rig.rest};--hoist-lift:${rig.lift}">
      ${illustratedProp('crane',height*.65,126,height)}
      <g class="crane-hoist-anchor" transform="translate(${rig.x} ${rig.y})">
        <path class="crane-cable" d="M0 0V1" fill="none" stroke="#526a79" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <g class="crane-load" data-crane-material="${deliveryMaterial(stage,i)}" opacity="0">${materialArtwork(deliveryMaterial(stage,i),18,rig.loadHeight)}</g>
      </g>
    </g>`;
  }).join('');
  return `<g class="city-linework" fill="none" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <g class="city-buildings"${landscape?` data-growth-height="${growthHeight}"`:""}${landscape?` transform="${settlementTransform(end,stage)}"`:""}>
      <g class="city-established" opacity="${stage===next?1:1-build.progress*.95}">${cityImage(stage).replace('class="city-buildings"','class="city-illustration"')}</g>
      <defs><clipPath id="${clipId}">${build.sites.map((site,i)=>`<rect x="${i*330/build.sites.length}" y="${129-growthHeight*site.built}" width="${330/build.sites.length+.5}" height="${growthHeight*site.built}"/>`).join('')}</clipPath></defs>
      <g class="city-rising" clip-path="url(#${clipId})" opacity="${stage===next?0:clamp(build.progress*5)}">${cityImage(next).replace('class="city-buildings"','class="city-illustration"')}</g>
    </g>
    <g class="construction-site">${cranes}</g>
    ${landscape?cityDistricts(build,stage):`<g class="city-projects">${build.sites.map((site,i)=>buildingSite(site,i)).join('')}</g>${cityWorksites(build,false)}<g class="city-site-vehicles">${Array.from({length:build.vehicles},(_,i)=>siteVehicle(i,stage)).join('')}</g>`}
    ${landscape?cityResidents(stage):''}
    <g class="site-supplies${landscape?' city-activity-anchor':''}"${landscape?' data-city-x="267" data-city-y="96"':''} transform="translate(267 139)"><g class="delivery-stock"></g></g>
    <g${anchor(292,97)} transform="translate(292 135)"><g class="crew-carrier">${person({woman:true,carry:true})}</g></g>
    <g${anchor(258,96)} transform="translate(258 135)"><g class="crew-builder">${person()}</g></g>
    <g${anchor(85,95)} transform="translate(85 135)"><g class="crew-receiver">${person({woman:true})}</g></g>
    <g class="city-helpers">${cityHelpers(stage,landscape)}</g>
  </g>`;
}
// Shared by the initial SVG and the animator's responsive layout.
export const CITY_ROUTE_SCENE=Object.freeze({height:280});

// Within a tier, only growth measurements change. Keep the illustrated SVGs
// and animated crews in place instead of generating/parsing them every poll.
export function updateCityGrowth(svg,stage,progress) {
  const build=cityConstruction(stage,progress),final=stage===CITY_STAGES.length-1;
  const growthHeight=svg.classList.contains('city-route-scene')?settlementHeight(Math.min(stage+1,CITY_STAGES.length-1)):145;
  const set=(node,name,value)=>{const text=String(value);if(node.getAttribute(name)!==text)node.setAttribute(name,text);};
  set(svg.querySelector('.city-established'),'opacity',final?1:1-build.progress*.95);
  set(svg.querySelector('.city-rising'),'opacity',final?0:clamp(build.progress*5));
  const clips=svg.querySelectorAll('.city-buildings clipPath rect');
  build.sites.forEach((site,i)=>{
    set(clips[i],'y',129-growthHeight*site.built);set(clips[i],'height',growthHeight*site.built);
    const project=svg.querySelector(`[data-render-key="project-${i}"]`),platform=Math.min(site.height-4,site.height*(.18+.82*site.built));
    set(project,'data-build-progress',site.built.toFixed(4));set(project,'data-build-phase',site.phase);
    set(project,'opacity',1-clamp((site.built-.86)/.14));
    const worksite=svg.querySelector(`[data-render-key="worksite-${i}"]`);
    if(worksite)set(worksite,'opacity',1-clamp((site.built-.86)/.14));
    const yard=svg.querySelector(`[data-render-key="yard-${i}"]`);
    if(yard)set(yard,'opacity',1-clamp((site.built-.86)/.14));
    set(project.querySelector('.site-window-lights>g'),'opacity',clamp((site.built-.55)/.35));
    const title=project.querySelector('title'),label=`${PROJECT_NAMES[site.design]} · ${site.phase.toLowerCase()}`;
    if(title.textContent!==label)title.textContent=label;
    const scaffold=project.querySelector('.site-scaffolding');
    set(scaffold,'opacity',1-clamp((site.built-.84)/.16));
    set(scaffold.firstElementChild,'transform',`translate(${site.width*.35} -${platform})`);
    const phase=Math.min(3,Math.max(0,(site.built-.18)/.82)*3);
    project.querySelectorAll('.construction-phase').forEach((node,frame)=>set(node,'opacity',Math.max(0,1-Math.abs(phase-frame))));
    set(project.querySelector('.foundation-bricks'),'style',`clip-path:inset(0 ${Math.max(0,1-site.built/.18)*100}% 0 0)`);
  });
}

export function renderCity({key,bytes,busy=false,airdrop=false,convoy='',trafficLabel='',includeArtwork=true,date=new Date()}) {
  const stage=cityStage(bytes);
  const build=cityConstruction(stage.index,stage.progress);
  // key is escaped by the caller; stage names and geometry are internal constants.
  const scene=CITY_ROUTE_SCENE;
  const end=655,growth=infrastructure(stage.index);
  const world=convoy?`<g class="world-landscape">${worldBackdrop(stage.index)}<g class="world-infrastructure">${worldRoads(stage.index,end)}</g><g class="world-city" transform="translate(${end-80} 28)">${includeArtwork?cityArtwork(stage.index,stage.progress,key,true,end):''}</g><g class="world-decoration">${worldNature(stage.index,end)}</g></g><g class="world-atmosphere">${worldSky(stage.index,end,key)}</g>`:includeArtwork?cityArtwork(stage.index,stage.progress,key):'';
  return `<svg class="application-city ${convoy?'convoy-svg city-route-scene ':''}${busy?'city-working':'city-resting'} ${airdrop?'has-airdrop':''} ${stage.known?'':'city-unmeasured'}" data-city-key="${key}" data-stage="${stage.index}" data-progress="${stage.progress}" data-build-phase="${build.phase}" data-time="${worldTime(date).phase}" data-infrastructure="${growth.tier}" ${convoy} viewBox="${convoy?`0 -20 900 ${scene.height}`:'0 -20 330 178'}" role="img" aria-label="${stage.name}; ${stage.known?(stage.next?build.phase.toLowerCase()+' toward '+stage.next:'construction complete'):'awaiting measured supplies'}; ${growth.name.toLowerCase()}; ${busy?'construction crew working':'crew resting'}${trafficLabel?'; '+trafficLabel:''}">${world}</svg>`;
}

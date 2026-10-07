import {illustratedCity,illustratedWorker,illustratedProp} from './illustration-art.js';
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
  const {built,x,height,house}=site,width=house?24:27,depth=7;
  const structure=height*(.18+.82*built),cladding=height*clamp((built-.28)/.62);
  const floors=Array.from({length:Math.floor(structure/9)},(_,floor)=>{
    const y=-9*(floor+1);
    return `<path d="M0 ${y}h${width}l${depth}-4M${width} ${y}v9"/><path d="M${width/2} ${y}v9"/>`;
  }).join('');
  const scaffold=Array.from({length:Math.ceil(height/12)},(_,floor)=>{
    const y=-floor*12;
    return `<path d="M-4 ${y}h${width+8}m-${width+8} 0  ${width+8}-12"/>`;
  }).join('');
  return `<g class="city-project" data-render-key="project-${i}" data-build-progress="${built.toFixed(4)}" data-build-phase="${site.phase}" opacity="${1-clamp((built-.86)/.14)}" transform="translate(${x} 128)">
    <title>${house?'House':'Tower'} · ${site.phase.toLowerCase()}</title>
    <path d="M-5 2  ${width+1} 2l10-5H5z" fill="#e0dbcc" stroke="#a8a28e"/>
    <g class="building-frame" stroke="${house?'#a58a62':'#718a9b'}" stroke-width=".85">
      <path d="M0 0v-${structure}h${width}v${structure}m0-${structure} ${depth}-4v${structure}M${width+depth} -4l-${depth} 4M0 -${structure}l${depth}-4h${width}" fill="${house?'#f4ead5':'#e8eef0'}" fill-opacity=".32"/>
      ${floors}
    </g>
    <g class="building-cladding" opacity="${clamp((built-.25)*3)}">
      <path d="M0 0v-${cladding}h${width}v${cladding}z" fill="${house?'#ece2cf':'#b9d4dc'}" stroke="#8297a0" stroke-width=".6"/>
      <path d="M${width} 0v-${cladding}l${depth}-4v${cladding}z" fill="${house?'#d3c4ac':'#94b7c4'}" stroke="#8297a0" stroke-width=".6"/>
      ${Array.from({length:Math.floor(cladding/9)},(_,floor)=>`<path d="M3 -${floor*9+4}h${width-6}" stroke="#eff6f5" stroke-width="3"/>`).join('')}
      ${house?`<path d="M9 0v-10h6V0" fill="#a88c6b"/>`:''}
    </g>
    <g class="building-roof" opacity="${clamp((built-.8)*5)}">
      ${house?`<path d="M-2 -${height}l${width/2+2}-12 ${width/2+2} 12-8 4-${width/2}-11-${width/2} 11z" fill="#c4957a" stroke="#8c7669"/>`:`<path d="M-1 -${height}l8-4h${width+2}l-8 4z" fill="#d8e4df" stroke="#748b92"/>`}
    </g>
    <g class="site-scaffolding" opacity="${1-clamp((built-.84)/.16)}" stroke="#ad9976" stroke-width=".7">
      <path d="M-4 2v-${height+6}m${width+8} 0v${height+6}"/>${scaffold}
      <path d="M-6 -${Math.min(height-4,structure)}h${width+12}" stroke="#c6b18a" stroke-width="2.2"/>
      <g transform="translate(${width+2} -${Math.min(height-4,structure)})"><g class="crew-builder" style="animation-delay:-${i*.7}s">${worker({woman:i%2===0})}</g></g>
    </g>
  </g>`;
}

function siteVehicle(i) {
  // Small site machinery uses the same ink contours and warm washes as the art.
  const mixer=i===1;
  return `<g data-render-key="site-vehicle-${i}" transform="translate(${i===0?59:i===1?172:242} ${i===1?145:142})">
    <g class="site-vehicle" style="--machine-delay:-${i*3}s;--machine-direction:${i===2?-1:1}">
      <ellipse cx="0" cy="1" rx="18" ry="2" fill="#dbe2df" stroke="none"/>
      <g fill="#d6ac68" stroke="#657882" stroke-width=".8">
        ${mixer?'<path d="M-16-6h29v5h-29zM5-6v-12h7l5 6v6z"/><path d="M7-11h5l3 4H7z" fill="#b7d4dc"/><g class="mixer-drum"><path d="M-14-14-8-18 2-13 0-6-8-5-15-10z" fill="#e6ded0"/><path d="m-11-14 9 6m-11-2 9 5"/></g>':'<path d="M-13-5h22v-8H-2v-6h-9z"/><path d="M-10-17h7v9h-7z" fill="#bad4dc"/><g class="excavator-arm"><path d="M6-10 16-24 25-14" fill="none" stroke="#c8a05f" stroke-width="4"/><path d="m22-16 8 3-3 7-6-3z" fill="#bfa179"/><path d="m8-11 8-10" stroke="#687e88"/></g>'}
        <path d="M-13-4h23" stroke-width="3"/>
        <g fill="#73828a"><circle cx="-10" cy="-2" r="3.3"/><circle cx="8" cy="-2" r="3.3"/></g>
        <g class="site-wheel" fill="#d5dcd8"><circle cx="-10" cy="-2" r="1.3"/><circle cx="8" cy="-2" r="1.3"/></g>
      </g>
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
      <g transform="translate(12 ${119-height*.55})"><g class="crane-load"><path d="M0-10v10" stroke="#81929a"/><path d="M-4 0h8v6h-8z" fill="#d6b887" stroke="#8e846e"/><path d="m-4 0 8 6m0-6-8 6" stroke="#9d8968"/></g></g>
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
    <g class="city-site-vehicles">${Array.from({length:build.vehicles},(_,i)=>siteVehicle(i)).join('')}</g>
    <g class="site-supplies" transform="translate(267 139)" fill="#d8bc8e" stroke="#9a8b76" stroke-width=".6"><path d="M-9-4h18v4H-9zM-7-7H9v3H-7zM-10-10H6v3h-16z"/><path d="M13-8h8v8h-8zM17-8v8"/></g>
    <g transform="translate(292 135)"><g class="crew-carrier">${worker({woman:true,carry:true})}</g></g>
    <g transform="translate(258 135)"><g class="crew-builder">${worker()}</g></g>
    <g transform="translate(85 135)"><g class="crew-receiver">${worker({woman:true})}</g></g>
    <g class="city-helpers">${cityHelpers(stage)}</g>
    <g class="city-airdrop">${illustratedProp('airdrop',25,39,39)}</g>
  </g>`;
}
// Shared by the initial SVG and the animator's responsive layout.
export const CITY_ROUTE_SCENE={height:178,download:{road:126,vehicle:115,air:70,arrow:110},upload:{road:80,vehicle:71,air:24,arrow:66},divider:103};

export function renderCity({key,bytes,busy=false,airdrop=false,convoy='',trafficLabel=''}) {
  const stage=cityStage(bytes);
  const build=cityConstruction(stage.index,stage.progress);
  // key is escaped by the caller; stage names and geometry are internal constants.
  const scene=CITY_ROUTE_SCENE;
  return `<svg class="application-city ${convoy?'convoy-svg city-route-scene ':''}${busy?'city-working':'city-resting'} ${airdrop?'has-airdrop':''} ${stage.known?'':'city-unmeasured'}" data-city-key="${key}" data-stage="${stage.index}" data-progress="${stage.progress}" data-build-phase="${build.phase}" ${convoy} viewBox="${convoy?`0 -20 930 ${scene.height}`:'0 -20 330 178'}" role="img" aria-label="${stage.name}; ${stage.known?(stage.next?build.phase.toLowerCase()+' toward '+stage.next:'construction complete'):'awaiting measured supplies'}; ${busy?'construction crew working':'crew resting'}${trafficLabel?'; '+trafficLabel:''}">${cityArtwork(stage.index,stage.progress,key)}${convoy?`<g class="city-supply-road"><path d="M292 ${scene.upload.road}h620" class="road outgoing-road"/><path d="M292 ${scene.download.road}h620" class="road incoming-road"/><path d="M320 ${scene.divider}h592" class="road-divider"/><path d="m565 ${scene.upload.arrow} 5 5-5 5m60-10 5 5-5 5" class="lane-arrow outgoing-road"/><path d="m570 ${scene.download.arrow}-5 5 5 5m60-10-5 5 5 5" class="lane-arrow incoming-road"/></g>`:''}</svg>`;
}

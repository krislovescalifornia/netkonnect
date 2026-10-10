import {LIVING_FRAMES} from './artwork/living/frames.js';
import {illustratedResident} from './settlement-art.js';
import {illustratedWorker,illustratedConstructionVehicle} from './illustration-art.js';
import {projectArtwork,deliveryMaterial,PROJECT_NAMES} from './construction-art.js';

// Each level is an authored place: its architecture, street pattern and work
// parcels change together. All positions use normalized horizontal anchors.
export const LIVING_PROFILES=[
  ['clearing','#dcecc9','#ecb952',0,[.23,.08,.50,.73,.89],[164,177,166,179,188]],
  ['woodland','#d4e8cf','#bd733b',0,[.25,.07,.52,.77,.91],[170,169,176,185,194]],
  ['first-garden','#e3edd2','#dd684c',0,[.22,.08,.51,.77,.91],[164,180,171,184,195]],
  ['working-land','#e5edc4','#bc543d',0,[.17,.41,.65,.84,.96],[174,166,184,178,196]],
  ['grand-house','#e4edd5','#994e60',0,[.27,.08,.53,.77,.93],[176,193,175,183,195]],
  ['garden-domain','#d7ebd5','#c15d85',0,[.22,.47,.66,.82,.94],[176,196,171,184,186]],
  ['shared-courtyard','#fff0cf','#df6856',1,[.16,.39,.62,.80,.94],[170,163,196,178,184]],
  ['connected-blocks','#e4edd7','#4b9296',0,[.13,.37,.61,.79,.94],[176,169,182,174,191]],
  ['market-green','#ede9d3','#9875b3',1,[.12,.35,.55,.76,.92],[178,166,196,180,185]],
  ['main-street','#f2e3cb','#ba6047',1,[.12,.34,.57,.76,.93],[178,164,175,180,193]],
  ['tram-downtown','#dae7e8','#278b98',2,[.12,.36,.55,.75,.93],[177,165,194,181,183]],
  ['river-interchange','#e0ece8','#bb7050',2,[.13,.34,.53,.77,.94],[175,196,176,167,192]],
  ['vertical-density','#d9e4ef','#c85894',2,[.12,.33,.55,.77,.94],[170,189,177,162,199]],
  ['civic-grandeur','#f1e9d8','#b68b38',1,[.30,.09,.53,.75,.93],[175,183,196,179,191]],
  ['layered-city','#dce2ee','#27b9c5',2,[.13,.33,.53,.75,.95],[169,191,177,161,192]],
  ['urban-forest','#d5edde','#449c75',0,[.13,.33,.55,.76,.94],[167,185,178,170,194]],
  ['civic-technology','#e0eff2','#8160b3',3,[.13,.34,.54,.77,.93],[170,194,174,167,193]],
  ['integrated-habitat','#e7eedc','#358e89',3,[.30,.09,.55,.78,.95],[175,186,189,164,198]],
  ['launch-harbor','#dde6f0','#df8741',3,[.12,.34,.55,.77,.94],[180,171,188,178,198]],
  ['future-civilization','#e8e4f4','#7d62b5',3,[.12,.34,.54,.76,.94],[174,187,174,165,197]]
].map(([id,ground,accent,texture,x,y])=>Object.freeze({id,ground,accent,texture,x,y}));
export const LIVING_ASSETS=['living-city.js','artwork/living/frames.js','artwork/living/ground.png','artwork/living/actors.png','artwork/living/crane.png',...LIVING_FRAMES.flatMap(row=>row.map(frame=>frame.file))];
const clamp=n=>Math.max(0,Math.min(1,n));
const f=n=>Number(n.toFixed(3));
const anchor=(id,x,y,scale=1)=>`class="city-activity-anchor" data-render-key="${id}" data-city-x="${x*1000}" data-city-y="${y}" data-city-scale="${scale}"`;
export function livingSprite(stage,column,width,maxHeight,baseline=0) {
  const frame=LIVING_FRAMES[stage][column],[w,h]=frame.size,scale=Math.min(width/w,maxHeight/h);
  return `<image class="living-architecture-pixels" href="${frame.file}" x="${f(-w*scale/2)}" y="${f(baseline-h*scale)}" width="${f(w*scale)}" height="${f(h*scale)}"/>`;
}
function poseSprite(row,width,height) {
  // Registered four-pose generated sheet, animated inside its fixed viewport.
  return `<svg class="living-actor illustrated-person" x="${-width/2}" y="${-height}" width="${width}" height="${height}" viewBox="0 ${row*256} 384 256" overflow="hidden"><image class="living-pose" href="artwork/living/actors.png" width="1536" height="1024"/></svg>`;
}
export function livingBackdrop(stage) {
  const p=LIVING_PROFILES[stage];
  return `<svg class="world-terrain living-ground" x="0" y="153" width="900" height="127" viewBox="0 ${p.texture*256} 1536 256" preserveAspectRatio="none" overflow="hidden"><image href="artwork/living/ground.png" width="1536" height="1024"/></svg>`;
}
function residents(stage) {
  const count=Math.min(50,12+stage*2);
  return '<g class="city-residents">'+Array.from({length:count},(_,i)=>{
    const x=.035+(i+.5)/count*.92,y=[151,181,201][i%3];
    return `<g ${anchor('resident-'+i,x,y,i%3===0?.82:1).replace('city-activity-anchor','city-activity-anchor resident-home')} data-population-index="${i}" transform="translate(${x*900} ${y})"><g class="resident-walk" style="--walk-distance:${28+i%5*9}px;--walk-duration:${8+i%7}s;--walk-delay:-${i*1.21}s;--stride-delay:-${i*.17}s"><g class="resident-facing"><g transform="scale(1.6)">${illustratedResident(i)}</g></g></g></g>`;
  }).join('')+'</g>';
}
function streetLife(stage) {
  const green=stage<6||stage===15;
  const gardens=Array.from({length:green?5:2},(_,i)=>{
    const x=.07+i*.195;
    return `<g ${anchor('gardener-'+i,x,190)} transform="translate(${x*900} 190)"><g class="living-gardener" style="--pose-delay:-${i*.36}s">${poseSprite(0,25,25)}</g></g>`;
  }).join('');
  const cyclists=Array.from({length:stage<2?1:stage<10?3:5},(_,i)=>{
    const x=.14+i*.17;
    return `<g ${anchor('cyclist-'+i,x,197)} transform="translate(${x*900} 197)"><g class="living-cycle-route" style="--walk-duration:${17+i*3}s;--walk-delay:-${i*4.1}s;--walk-distance:${90+i*15}px"><g class="resident-facing" style="--walk-duration:${17+i*3}s;--walk-delay:-${i*4.1}s">${poseSprite(2,37,25)}</g></g></g>`;
  }).join('');
  const trams=stage>=10?Array.from({length:stage>=14?3:2},(_,i)=>`<g ${anchor('tram-'+i,.25+i*.39,202-i%2*19)} transform="translate(${(.25+i*.39)*900} ${202-i%2*19})"><g class="living-transit" style="--walk-distance:${190+i*40}px;--walk-duration:${28+i*8}s;--walk-delay:-${9+i*11}s"><g class="resident-facing" style="--walk-duration:${28+i*8}s;--walk-delay:-${9+i*11}s">${poseSprite(3,112,37)}</g></g></g>`).join(''):'';
  return `<g class="city-life">${gardens}${cyclists}${trams}</g>`;
}
function nature(stage) {
  const p=LIVING_PROFILES[stage];
  return '<g class="living-nature">'+Array.from({length:stage<10?8:5},(_,i)=>{
    const x=.03+i*.13,y=i%2?171:198;
    return `<g ${anchor('living-tree-'+i,x,y)} transform="translate(${x*900} ${y})"><g class="living-foliage" style="--nature-delay:-${i*1.3}s"><svg x="-16" y="-48" width="32" height="48" viewBox="1024 0 512 512" overflow="hidden"><image href="artwork/world/environment-v1.png" width="1536" height="1024"/></svg></g></g>`;
  }).join('')+`<g class="settlement-lights" fill="${p.accent}"></g></g>`;
}
function projectMarkup(site,i,stage,key) {
  const width=stage<4?64:stage<10?78:92,height=stage<4?65:stage<10?88:118;
  const built=site.built;
  const finish=clamp((built-.72)/.28),platform=height*(.15+.85*built);
  const clip='parcel-'+key+'-'+i;
  return `<g class="city-project" data-render-key="project-${i}" data-build-progress="${built.toFixed(4)}" data-build-phase="${site.phase}" data-project-height="${height}" data-project-width="${width}">
    <title>${PROJECT_NAMES[stage]} · ${site.phase.toLowerCase()}</title>
    <g class="building-illustration" opacity="${1-finish}">${projectArtwork(stage,built,width,height)}</g>
    <defs><clipPath id="${clip}"><rect class="parcel-reveal" x="${-width}" y="${-height*built}" width="${width*2}" height="${height*built}"/></clipPath></defs>
    <g class="parcel-completed" opacity="${finish}" clip-path="url(#${clip})">${livingSprite(stage,3,width,height)}</g>
    <g class="site-window-lights"><g opacity="${clamp((built-.55)/.35)}" fill="#ffd775">${[0,1,2].map(j=>`<rect x="${-13+j*10}" y="-27" width="3" height="5"/>`).join('')}</g></g>
    <g class="site-scaffolding" opacity="${1-clamp((built-.92)/.08)}"><g transform="translate(${width*.32} -${platform})"><g class="crew-builder" style="--work-delay:-${i*.4}s">${poseSprite(1,25,26)}</g></g></g>
  </g>`;
}
function districts(build,stage,key) {
  const count=build.sites.length;
  return '<g class="city-districts">'+build.sites.map((site,i)=>{
    const x=.09+i*.83/Math.max(1,count-1),y=[174,188,181][(i+stage)%3],s=i%3===0?.86:1;
    return `<g class="construction-yard city-activity-anchor" data-render-key="yard-${i}" data-city-x="${x*1000}" data-city-y="${y}" data-city-scale="${s}" data-site-count="${count}" transform="translate(${x*900} ${y}) scale(${s})" style="--yard-span:30px;--machine-duration:${11+i*2.3}s;--machine-delay:-${i*3.2}s">
      <g class="city-projects">${projectMarkup(site,i,stage,key)}</g>
      <g class="site-stock" data-render-key="stock-${i}" transform="translate(-24 7)"></g>
      <g class="city-worksites"><g class="worksite-home" data-render-key="worksite-${i}" opacity="${1-clamp((site.built-.94)/.06)}" style="--work-delay:-${i*1.3}s;--walk-duration:${7+i}s;--walk-delay:-${i*1.7}s;--walk-distance:44px">
        <g class="worksite-hauler"><g class="crew-walker">${illustratedWorker({woman:i%2===0,carry:true,size:13})}</g></g>
        <g transform="translate(26 6)"><g class="crew-builder">${poseSprite(1,25,26)}</g></g>
        <g class="worksite-dust" fill="#e3bd87" stroke="none"><circle cy="4" r="5"/><circle cx="9" cy="1" r="4"/></g>
      </g></g>
      <g class="city-site-vehicles" opacity="${1-clamp((site.built-.97)/.03)}"><g class="site-vehicle" style="--machine-direction:${i%2?-1:1}"><g class="machine-facing">${illustratedConstructionVehicle(i%3===1?'cement-mixer':'excavator',stage+i)}</g></g></g>
    </g>`;
  }).join('')+'</g>';
}
function cranes(build,stage) {
  return '<g class="construction-site">'+Array.from({length:build.cranes},(_,i)=>{
    const x=.11+i*.80/Math.max(1,build.cranes-1),h=stage<8?110:166+(i%2)*12,w=h*2/3,rig={x:w*.30,y:190-h+h*.20,rest:h*.43,lift:h*.05};
    return `<g class="site-crane city-activity-anchor" data-render-key="crane-${i}" data-city-x="${x*1000}" data-city-y="0" transform="translate(${x*900} 0)" style="--hoist-delay:-${i*2.3}s;--hoist-duration:${7+i%3*1.5}s;--hoist-rest:${rig.rest};--hoist-lift:${rig.lift}">
      <image class="living-crane-pixels" href="artwork/living/crane.png" x="${-w/2}" y="${190-h}" width="${w}" height="${h}"/>
      <g class="crane-hoist-anchor" transform="translate(${rig.x} ${rig.y})"><path class="crane-cable" d="M0 0V1" fill="none" stroke="#4f6572" stroke-width="1.5" vector-effect="non-scaling-stroke"/><g class="crane-load" data-crane-material="${deliveryMaterial(stage,i)}" opacity="0"></g></g>
    </g>`;
  }).join('')+'</g>';
}
export function livingCityArtwork(stage,build,key,end=655) {
  const p=LIVING_PROFILES[stage],extent=end+245;
  key=encodeURIComponent(key).replaceAll('%','_');
  const modules=[0,1,2,4]; // Column 3 is reserved for measured work parcels.
  const backBlocks=stage>=10&&![13,17,18].includes(stage)?Array.from({length:6},(_,i)=>{
    const col=i%2,x=.09+i*.165,y=164+i%3*5;
    return `<g ${anchor('back-block-'+i,x,y)} data-module="${col}" data-module-height="108" transform="translate(${x*extent} ${y})">${livingSprite(stage,col,extent*.18,108)}</g>`;
  }).join(''):'';
  const architecture=backBlocks+modules.map((col,i)=>{
    const height=col===0&&[4,5,13,17].includes(stage)?180:stage>=10?174:143;
    return `<g ${anchor('architecture-'+col,p.x[col],p.y[col])} data-module="${col}" data-module-height="${height}" transform="translate(${p.x[col]*extent} ${p.y[col]})">${livingSprite(stage,col,extent*.24,height)}</g>`;
  }).join('');
  return `<g class="city-linework living-diorama" data-render-key="living-diorama" data-place="${p.id}">
    <g class="city-buildings"><g class="city-established" opacity="1">${architecture}</g></g>
    ${cranes(build,stage)}${districts(build,stage,key)}${nature(stage)}${streetLife(stage)}${residents(stage)}
    <g class="city-helpers">${[0,1,2].map(i=>`<g ${anchor('helper-'+i,.18+i*.32,200)} transform="translate(${(.18+i*.32)*extent} 200)"><g class="crew-walker" style="--walk-distance:48px;--walk-duration:${10+i*3}s;--walk-delay:-${i*4}s">${illustratedWorker({woman:!!(i%2),carry:true,size:13})}</g></g>`).join('')}</g>
    <g class="site-supplies"><g class="delivery-stock"></g></g><g ${anchor('receiver',.89,203)} transform="translate(${extent*.89} 203)"><g class="crew-carrier">${illustratedWorker({woman:true,carry:true,size:13})}</g></g>
  </g>`;
}
export function layoutLivingCity(svg,end) {
  const extent=end+245,stage=Number(svg.dataset.stage),p=LIVING_PROFILES[stage];
  svg.style.setProperty('--living-ground',p.ground);svg.style.setProperty('--living-accent',p.accent);
  svg.querySelector('.living-diorama').dataset.place=p.id;
  svg.querySelector('.world-city')?.setAttribute('transform','translate(0 0)');
  for(const node of svg.querySelectorAll('.world-city .city-activity-anchor')) {
    const x=Number(node.dataset.cityX)/1000*extent,y=Number(node.dataset.cityY),s=Number(node.dataset.cityScale)||1;
    node.setAttribute('transform',`translate(${f(x)} ${y}) scale(${s})`);
    if(node.dataset.module) {
      const image=node.querySelector('image'),frame=LIVING_FRAMES[stage][Number(node.dataset.module)];
      const [w,h]=frame.size,scale=Math.min(extent*.24/w,Number(node.dataset.moduleHeight)/h);
      for(const [name,value] of Object.entries({x:f(-w*scale/2),y:f(-h*scale),width:f(w*scale),height:f(h*scale)}))image.setAttribute(name,value);
    }
    if(node.classList.contains('construction-yard'))node.style.setProperty('--yard-span',Math.max(18,Math.min(48,extent/(Number(node.dataset.siteCount)||3)*.17))+'px');
    if(node.dataset.populationIndex)node.style.visibility=extent<580&&Number(node.dataset.populationIndex)%3===0?'hidden':'';
  }
  svg.querySelector('.living-ground')?.setAttribute('viewBox',`0 ${p.texture*256} 1536 256`);
}
export function livingDestination(site,end) {
  return {x:Number(site?.dataset.cityX||700)/1000*(end+245)-24,y:Number(site?.dataset.cityY||181)+5};
}
export function updateLivingGrowth(svg,build) {
  const set=(node,name,value)=>{if(node&&node.getAttribute(name)!==String(value))node.setAttribute(name,value);};
  build.sites.forEach((site,i)=>{
    const project=svg.querySelector(`[data-render-key="project-${i}"]`);if(!project)return;
    const built=site.built,height=Number(project.dataset.projectHeight),width=Number(project.dataset.projectWidth),finish=clamp((built-.72)/.28);
    set(project,'data-build-progress',built.toFixed(4));set(project,'data-build-phase',site.phase);
    set(project.querySelector('.building-illustration'),'opacity',1-finish);set(project.querySelector('.parcel-completed'),'opacity',finish);
    set(project.querySelector('.parcel-reveal'),'y',-height*built);set(project.querySelector('.parcel-reveal'),'height',height*built);
    set(project.querySelector('.site-window-lights>g'),'opacity',clamp((built-.55)/.35));
    const scaffold=project.querySelector('.site-scaffolding');set(scaffold,'opacity',1-clamp((built-.92)/.08));set(scaffold.firstElementChild,'transform',`translate(${width*.32} -${height*(.15+.85*built)})`);
    const phase=Math.min(3,Math.max(0,(built-.18)/.82)*3);
    project.querySelectorAll('.construction-phase').forEach((node,frame)=>set(node,'opacity',Math.max(0,1-Math.abs(phase-frame))));
    set(project.querySelector('.foundation-bricks'),'style',`clip-path:inset(0 ${Math.max(0,1-built/.18)*100}% 0 0)`);
    set(svg.querySelector(`[data-render-key="worksite-${i}"]`),'opacity',1-clamp((built-.94)/.06));
    set(project.closest('.construction-yard').querySelector('.city-site-vehicles'),'opacity',1-clamp((built-.97)/.03));
    const title=project.querySelector('title');title.textContent=`${PROJECT_NAMES[Number(svg.dataset.stage)]} · ${site.phase.toLowerCase()}`;
  });
}


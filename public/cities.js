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
export function cityArtwork(stage) {
  return `<g class="city-linework" fill="none" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    ${illustratedCity(stage)}
    <g class="construction-site" transform="translate(286 0)"><g class="site-crane">${illustratedProp('crane',39,130,75)}</g></g>
    <g transform="translate(292 135)"><g class="crew-carrier">${worker({woman:true,carry:true})}</g></g>
    <g transform="translate(258 135)"><g class="crew-builder">${worker()}</g></g>
    <g transform="translate(85 135)"><g class="crew-receiver">${worker({woman:true})}</g></g>
    <g class="city-helpers">${cityHelpers(stage)}</g>
    <g class="city-airdrop">${illustratedProp('airdrop',25,39,39)}</g>
  </g>`;
}
export function renderCity({key,bytes,busy=false,airdrop=false,convoy='',trafficLabel=''}) {
  const stage=cityStage(bytes);
  // key is escaped by the caller; stage names and geometry are internal constants.
  return `<svg class="application-city ${convoy?'convoy-svg city-route-scene ':''}${busy?'city-working':'city-resting'} ${airdrop?'has-airdrop':''} ${stage.known?'':'city-unmeasured'}" data-city-key="${key}" data-stage="${stage.index}" data-progress="${stage.progress}" ${convoy} viewBox="${convoy?'0 -20 930 215':'0 -20 330 178'}" role="img" aria-label="${stage.name}; ${busy?'construction crew working':'crew resting'}${trafficLabel?'; '+trafficLabel:''}">${cityArtwork(stage.index)}${convoy?'<g class="city-supply-road"><path d="M292 132h620" class="road incoming-road"/><path d="M292 178h620" class="road outgoing-road"/><path d="M320 153h592" class="road-divider"/><path d="m570 116-5 5 5 5m60-10-5 5 5 5" class="lane-arrow incoming-road"/><path d="m565 164 5 5-5 5m60-10 5 5-5 5" class="lane-arrow outgoing-road"/></g>':''}</svg>`;
}

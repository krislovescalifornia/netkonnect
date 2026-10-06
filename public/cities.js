// Architectural line art, shared by the city and its supply convoy.
// These are measured-byte milestones; animation never manufactures usage.
const MB=1024**2, GB=1024**3;
export const CITY_STAGES=[
  {name:'Shack',at:0}, {name:'House',at:64*MB}, {name:'Mansion',at:512*MB},
  {name:'Neighborhood',at:2*GB}, {name:'Village',at:8*GB},
  {name:'City',at:32*GB}, {name:'Metropolis',at:128*GB}
];
export function cityStage(bytes) {
  if(!Number.isFinite(bytes))return {index:0,name:'Awaiting measured data',progress:0,known:false};
  bytes=Math.max(0,bytes);
  const index=CITY_STAGES.findLastIndex(s=>bytes>=s.at),stage=CITY_STAGES[index];
  const next=CITY_STAGES[index+1];
  return {index:Math.max(0,index),name:stage.name,known:true,progress:next?Math.max(0,Math.min(1,(bytes-stage.at)/(next.at-stage.at))):1,next:next?.name};
}
export function worker({woman=false,color='#76bdd2',carry=false}={}) {
  return `<g class="helper-person" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    ${woman?'<path d="M-3-18q-4 3-2 7l4-1" fill="#735847"/>':''}<circle cy="-17" r="3" fill="#f2c5a0"/>
    <path d="M-4-19q1-5 7-2l1 2z" fill="#efbe58"/><path d="M-5-19h10"/>
    <path d="M-2-13h4l2 8h-8z" fill="${color}"/><path class="helper-legs" d="M-2-5-4 0M2-5 5 0" fill="none"/>
    <g class="helper-arms"><path d="M-2-11-5-7M2-11 6-8" fill="none"/>${carry?'<path d="M2-10h10v5H2z" fill="#dfb36f"/><path d="M3-9 11-6M11-9 3-6"/>':''}</g></g>`;
}
function tree(x,y=131,size=1) {
  return `<g transform="translate(${x} ${y}) scale(${size})"><path d="M0 0v-21"/><path d="M0-39c-12-1-12 21-3 24 15 5 17-19 8-23z" fill="#b3d58b"/></g>`;
}
function house(x,y=130,{width=38,height=29,roof='#ed9b83',shop=false}={}) {
  return `<g transform="translate(${x} ${y})"><path d="M0 0v-${height}h${width}V0z" fill="#fff7e5"/><path d="M-4-${height}l${width/2+4}-18 ${width/2+4} 18z" fill="${roof}"/>
    <path d="M${width-9}-${height+10}v-12h4v15" fill="#e5edf0"/><path d="M${width/2-4} 0v-16h8V0" fill="#accfe0"/>
    <path d="M5-${height-7}h7v8H5zM${width-12}-${height-7}h7v8h-7z" fill="#b7dbea"/>${shop?`<path d="M2-20h${width-4}v7H2z" fill="#91cbc6"/><path d="M8-18h${width-16}"/>`:''}</g>`;
}
function tower(x,width,height,color) {
  let windows='';for(let y=137-height;y<120;y+=12)for(let w=5;w<width-4;w+=9)windows+=`<path d="M${x+w} ${y}v5"/>`;
  return `<g><path d="M${x} 130V${130-height}h${width}V130" fill="${color}"/><path d="M${x+width/2} ${130-height}v-9"/>${windows}</g>`;
}
function architecture(stage) {
  if(stage===0)return `<path d="M128 130V102h37v28" fill="#e5bf84"/><path d="M123 102l24-12 24 12z" fill="#9cc3cc"/><path d="M135 130v-22h12v22M151 107v21M158 106v22"/>${tree(187,131,.7)}`;
  if(stage===1)return house(125)+tree(105,131,.8)+tree(184,131,.8);
  if(stage===2)return house(115,130,{width:64,height:40,roof:'#9fb9c8'})+house(93,130,{width:24,height:24})+house(179,130,{width:24,height:24})+tree(78,131,.9)+tree(216,131,.9)+`<path d="M135 112v-24h5v24M153 112v-24h5v24"/>`;
  if(stage===3)return house(82,130,{width:31})+house(113,119,{width:32,height:30,roof:'#8fc6cc'})+house(149,130,{width:35})+house(189,130,{width:31,roof:'#b9cf85'})+tree(65,131,.8)+tree(238,131,.9);
  if(stage===4)return house(65,130,{width:30})+house(106,130,{width:39,shop:true})+house(200,130,{width:39,height:38})+`<path d="M161 130V66h25v64" fill="#fff2d3"/><path d="M157 66l17-20 16 20z" fill="#e8a383"/><circle cx="174" cy="79" r="6" fill="white"/><path d="M174 75v4l3 2M167 101h12v13h-12"/>`+tree(50,131,.8)+tree(258,131,.9);
  const skyline=stage===5?[[58,28,48,'#fff0cf'],[95,27,75,'#c6e1e9'],[130,29,59,'#acd2c2'],[167,32,89,'#b2d5ed'],[207,24,54,'#f1d4b1']]:[[46,26,54,'#f5d9ae'],[78,28,89,'#b9dbe8'],[115,26,115,'#a3cfe8'],[151,27,139,'#b3d7ed'],[185,32,79,'#b8d4a4'],[227,28,99,'#cbe5ed'],[264,23,60,'#efca9d']];
  return skyline.map(([x,w,h,c])=>tower(x,w,h,c)).join('')+house(96,130,{width:31,height:22})+house(194,130,{width:29,height:24,shop:true})+tree(35,131,.65)+tree(294,131,.7);
}
export function cityArtwork(stage) {
  return `<g class="city-linework" fill="none" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M25 132h282" stroke="#86b5c4"/>${architecture(stage)}
    <g class="city-clouds" stroke="#c5e0eb"><path d="M61 46c-5-7-16-3-14 4h-8q-6-10 1-12 5-4 9 1 13-9 17 7zM233 23q-3-9-12-4-10-4-11 6h25"/></g>
    <g class="construction-site"><path d="M242 129V112h31v17" stroke-dasharray="3 3" stroke="#d5b779"/><path d="M242 123h31M249 112v17M266 112v17" stroke="#d5b779"/>
      <path class="construction-beam" d="M242 113h31" stroke="#77b9bd" stroke-width="3"/>
      <g class="site-crane"><path d="M280 130V50h-6v80M275 54 280 65 275 77 280 89 275 102 280 115M249 50h52v5h-52zM277 41l-28 9M277 41l24 9" fill="#fbefd0"/>
      <rect x="271" y="55" width="12" height="10" rx="2" fill="#b6dce7"/><g transform="translate(277 64) scale(.35)">${worker({woman:true,color:'#eea083'})}</g>
      <g class="crane-load"><path d="M255 55v34"/><path d="M249 90h13v9h-13z" fill="#e6bc78"/><path d="M250 91l11 7M261 91l-11 7"/></g></g>
    </g>
    <g transform="translate(52 131)"><g class="crew-carrier">${worker({woman:true,carry:true,color:'#e9a18a'})}</g></g>
    <g transform="translate(238 131)"><g class="crew-builder">${worker({color:'#82bdca'})}<path class="helper-hammer" d="M6-8 10-15h5"/></g></g>
    <g transform="translate(85 131)"><g class="crew-receiver">${worker({woman:true,color:'#aace81'})}</g></g>
    <g class="material-stack" fill="#e9c48a"><path d="M59 127h17v4H59zM62 123h17v4H62zM59 119h17v4H59z"/><path d="M205 126h13v5h-13zM209 121h13v5h-13z"/></g>
    <g class="city-airdrop" transform="translate(222 28)"><path d="M-13 0q13-23 26 0z" fill="#d2e9a8"/><path d="M-13 0 0 20 13 0M-5 0 0 20 5 0M-5 0q0-13 5-13 5 0 5 13"/><path d="M-6 20H6v9H-6z" fill="#ebc282"/><path d="M-5 21 5 28M5 21-5 28"/></g>
  </g>`;
}
export function renderCity({key,bytes,busy=false,airdrop=false}) {
  const stage=cityStage(bytes);
  // key is escaped by the caller; stage names and geometry are internal constants.
  return `<svg class="service-city ${busy?'city-working':'city-resting'} ${airdrop?'has-airdrop':''} ${stage.known?'':'city-unmeasured'}" data-city-key="${key}" data-stage="${stage.index}" data-progress="${stage.progress}" viewBox="0 -20 330 178" role="img" aria-label="${stage.name}; ${busy?'construction crew working':'crew resting'}">${cityArtwork(stage.index)}</svg>`;
}

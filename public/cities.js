// Architectural line art, shared by the city and its supply convoy.
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
export function worker({woman=false,color='#76bdd2',carry=false}={}) {
  return `<g class="helper-person" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    ${woman?'<path d="M-3-18q-4 3-2 7l4-1" fill="#735847"/>':''}<circle cy="-17" r="3" fill="#f2c5a0"/>
    <path d="M-4-19q1-5 7-2l1 2z" fill="#efbe58"/><path d="M-5-19h10"/>
    <path d="M-2-13h4l2 8h-8z" fill="${color}"/><path class="helper-legs" d="M-2-5-4 0M2-5 5 0" fill="none"/>
    <g class="helper-arms"><path d="M-2-11-5-7M2-11 6-8" fill="none"/>${carry?'<g class="worker-cargo"><path d="M2-10h10v5H2z" fill="#dfb36f"/><path d="M3-9 11-6M11-9 3-6"/></g>':''}</g></g>`;
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
function originalArchitecture(stage) {
  if(stage===0)return `<path d="M134 130V108h28v22" fill="#e5bf84"/><path d="M130 108l18-10 18 10z" fill="#9cc3cc"/><path d="M139 130v-17h9v17M153 112v17M158 111v18"/>${tree(187,131,.7)}`;
  if(stage===1)return house(125)+tree(105,131,.8)+tree(184,131,.8);
  if(stage===2)return house(115,130,{width:64,height:40,roof:'#9fb9c8'})+house(93,130,{width:24,height:24})+house(179,130,{width:24,height:24})+tree(78,131,.9)+tree(216,131,.9)+`<path d="M135 112v-24h5v24M153 112v-24h5v24"/>`;
  if(stage===3)return house(82,130,{width:31})+house(113,119,{width:32,height:30,roof:'#8fc6cc'})+house(149,130,{width:35})+house(189,130,{width:31,roof:'#b9cf85'})+tree(65,131,.8)+tree(238,131,.9);
  if(stage===4)return house(65,130,{width:30})+house(106,130,{width:39,shop:true})+house(200,130,{width:39,height:38})+`<path d="M161 130V66h25v64" fill="#fff2d3"/><path d="M157 66l17-20 16 20z" fill="#e8a383"/><circle cx="174" cy="79" r="6" fill="white"/><path d="M174 75v4l3 2M167 101h12v13h-12"/>`+tree(50,131,.8)+tree(258,131,.9);
  const skyline=stage===5?[[58,28,48,'#fff0cf'],[95,27,75,'#c6e1e9'],[130,29,59,'#acd2c2'],[167,32,89,'#b2d5ed'],[207,24,54,'#f1d4b1']]:[[46,26,54,'#f5d9ae'],[78,28,89,'#b9dbe8'],[115,26,115,'#a3cfe8'],[151,27,139,'#b3d7ed'],[185,32,79,'#b8d4a4'],[227,28,99,'#cbe5ed'],[264,23,60,'#efca9d']];
  return skyline.map(([x,w,h,c])=>tower(x,w,h,c)).join('')+house(96,130,{width:31,height:22})+house(194,130,{width:29,height:24,shop:true})+tree(35,131,.65)+tree(294,131,.7);
}
function dome(x,y,width,height) {
  return `<g><path d="M${x} ${y}q0-${height} ${width/2}-${height}t${width/2} ${height}z" fill="#d7edf0"/><path d="M${x+width/2} ${y-height}v${height}M${x+3} ${y-height/3}h${width-6}" stroke="#82b6c4"/></g>`;
}
function architecture(stage) {
  if(stage===0)return originalArchitecture(0);
  if(stage===1)return house(132,130,{width:31,height:26,roof:'#a9c69a'})+tree(115,131,.65)+`<path d="M173 130v-11h12v11" fill="#eac78e"/>`;
  if(stage===2)return originalArchitecture(1);
  if(stage===3)return house(116,130,{width:44,height:34})+house(172,130,{width:25,height:23,roof:'#b4cb92'})+tree(95,131,.85)+tree(215,131,.9)+`<path d="M106 131v-9m0 5h10M201 131v-9m0 5h14"/>`;
  if(stage===4)return originalArchitecture(2);
  if(stage===5)return originalArchitecture(2)+house(67,130,{width:25,height:30,roof:'#b3ce8f'})+house(208,130,{width:26,height:28,roof:'#93bec8'})+`<path d="M91 133q57 15 119 0M102 138h95" stroke="#a3c9b4"/>`;
  if(stage===6)return originalArchitecture(3);
  if(stage===7)return house(62,130,{width:30})+house(96,113,{width:31,roof:'#b8d29b'})+house(132,130,{width:34})+house(169,113,{width:33,roof:'#8fc6cc'})+house(208,130,{width:32})+house(244,130,{width:24,height:25})+tree(45,131,.7)+`<path d="M59 136h213M110 132v7M215 132v7" stroke="#a5c4cc"/>`;
  if(stage===8)return originalArchitecture(4);
  if(stage===9)return originalArchitecture(4)+tower(85,17,58,'#c3dfe5')+house(244,130,{width:28,height:31,shop:true})+`<path d="M125 95h24v35h-24z" fill="#c1d5a0"/><path d="M130 99h14M130 106h14"/>`;
  if(stage===10)return originalArchitecture(5);
  // Add a wider, denser skyline one tier at a time. Later tiers introduce
  // transit, roof gardens, skybridges, domes and orbital infrastructure.
  const count=Math.min(11,6+Math.floor((stage-11)/2)),width=stage>=17?21:24;
  const colors=['#f5dbb3','#c2e2eb','#b2d4a9','#add1e8','#d7e6ed'];
  let skyline='';
  for(let i=0;i<count;i++) {
    const x=38+i*(254/(count-1)),height=49+(stage-11)*7+((i*37)%58);
    skyline+=tower(x,width,Math.min(137,height),colors[i%colors.length]);
    if(stage>=15)skyline+=`<path d="M${x+2} ${131-Math.min(137,height)}h${width-4}" stroke="#92be85" stroke-width="4"/>`;
  }
  if(stage>=12)skyline+=`<path d="M43 113h221v5H43z" fill="#e2eaf0"/><path d="M62 118v12M217 118v12"/><rect x="109" y="106" width="66" height="10" rx="5" fill="#a9d4de"/><path d="M119 109h45" stroke-dasharray="5 3"/>`;
  if(stage>=13)skyline+=`<path d="M145 130V42h27v88" fill="#f3e6c8"/><path d="M141 42l17-20 18 20z" fill="#98bfcf"/><circle cx="158" cy="56" r="6" fill="#fff"/>`;
  if(stage>=14)skyline+=`<path d="M77 72h157v6H77z" fill="#d4e7e9"/><path d="M81 74h150" stroke-dasharray="3 5"/>`;
  if(stage>=15)skyline+=tree(53,130,.75)+tree(244,130,.75)+`<path d="M94 131q20-23 42 0" fill="#b5d6a1"/>`;
  if(stage>=16)skyline+=`<path d="M159 130V-9q16 5 21 27v112z" fill="#c4e6ed"/><path d="M166 7v104M160 37h17M160 65h19" stroke="#80b9cf"/><ellipse cx="169" cy="32" rx="26" ry="7" fill="#e3eff5"/>`;
  if(stage>=17)skyline+=dome(74,130,68,39)+dome(196,130,49,29)+`<path d="M153 86h69v6h-69z" fill="#afd8dd"/>`;
  if(stage>=18)skyline+=`<path d="M57 130V25h15v105" fill="#d4e8f1"/><ellipse cx="64" cy="23" rx="24" ry="6" fill="#ecf3f7"/><path d="M64 16V-8M55 9h18"/><path d="M211 17q22-16 38 0-16 6-38 0z" fill="#cce1b0"/><path d="M231 17v7"/>`;
  if(stage===19)skyline+=`<path d="M114 130V5q0-20 12-23 12 3 12 23v125" fill="#b4dfe6"/><ellipse cx="126" cy="17" rx="32" ry="8" fill="#e1edf7"/><path d="M117-5h18M118 46h16M119 55h14M121 64h10" stroke="#80b9ca"/>`+dome(30,130,42,24)+dome(250,130,53,36);
  return skyline+tree(27,131,.55)+tree(310,131,.55);
}
export function cityArtwork(stage) {
  return `<g class="city-linework" fill="none" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M25 132h282" stroke="#86b5c4"/><g class="city-buildings">${architecture(stage)}</g>
    <g class="city-clouds" stroke="#c5e0eb"><path d="M61 46c-5-7-16-3-14 4h-8q-6-10 1-12 5-4 9 1 13-9 17 7zM233 23q-3-9-12-4-10-4-11 6h25"/></g>
    <g class="construction-site"><path d="M242 129V112h31v17" stroke-dasharray="3 3" stroke="#d5b779"/><path d="M242 123h31M249 112v17M266 112v17" stroke="#d5b779"/>
      <path class="construction-beam" d="M242 113h31" stroke="#77b9bd" stroke-width="3"/>
      <g class="site-crane"><path d="M280 130V50h-6v80M275 54 280 65 275 77 280 89 275 102 280 115M249 50h52v5h-52zM277 41l-28 9M277 41l24 9" fill="#fbefd0"/>
      <rect x="271" y="55" width="12" height="10" rx="2" fill="#b6dce7"/><g transform="translate(277 64) scale(.35)">${worker({woman:true,color:'#eea083'})}</g>
      <g class="crane-load"><path d="M255 55v34"/><path d="M249 90h13v9h-13z" fill="#e6bc78"/><path d="M250 91l11 7M261 91l-11 7"/></g></g>
    </g>
    <g transform="translate(292 131)"><g class="crew-carrier">${worker({woman:true,carry:true,color:'#e9a18a'})}</g></g>
    <g transform="translate(238 131)"><g class="crew-builder">${worker({color:'#82bdca'})}<path class="helper-hammer" d="M6-8 10-15h5"/></g></g>
    <g transform="translate(85 131)"><g class="crew-receiver">${worker({woman:true,color:'#aace81'})}</g></g>
    <g class="material-stack" fill="#e9c48a"><path d="M59 127h17v4H59zM62 123h17v4H62zM59 119h17v4H59z"/><path d="M205 126h13v5h-13zM209 121h13v5h-13z"/></g>
    <g class="city-airdrop" transform="translate(222 28)"><path d="M-13 0q13-23 26 0z" fill="#d2e9a8"/><path d="M-13 0 0 20 13 0M-5 0 0 20 5 0M-5 0q0-13 5-13 5 0 5 13"/><path d="M-6 20H6v9H-6z" fill="#ebc282"/><path d="M-5 21 5 28M5 21-5 28"/></g>
  </g>`;
}
export function renderCity({key,bytes,busy=false,airdrop=false,convoy='',trafficLabel=''}) {
  const stage=cityStage(bytes);
  // key is escaped by the caller; stage names and geometry are internal constants.
  return `<svg class="application-city ${convoy?'convoy-svg city-route-scene ':''}${busy?'city-working':'city-resting'} ${airdrop?'has-airdrop':''} ${stage.known?'':'city-unmeasured'}" data-city-key="${key}" data-stage="${stage.index}" data-progress="${stage.progress}" ${convoy} viewBox="${convoy?'0 -20 930 195':'0 -20 330 178'}" role="img" aria-label="${stage.name}; ${busy?'construction crew working':'crew resting'}${trafficLabel?'; '+trafficLabel:''}">${cityArtwork(stage.index)}${convoy?'<g class="city-supply-road"><path d="M292 132h620" class="road incoming-road"/><path d="M292 158h620" class="road outgoing-road"/><path d="M320 143h592" class="road-divider"/><path d="m570 116-5 5 5 5m60-10-5 5 5 5" class="lane-arrow incoming-road"/><path d="m565 144 5 5-5 5m60-10 5 5-5 5" class="lane-arrow outgoing-road"/></g>':''}</svg>`;
}

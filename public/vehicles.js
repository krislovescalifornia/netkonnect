import {worker} from './cities.js';

const KB=1024, MB=1024**2;
// Throughput milestones are independent of a city's lifetime download total.
export const VEHICLE_STAGES=[
  {id:'wheelbarrow',name:'Wheelbarrow',at:0,mode:'road',width:34},
  {id:'handcart',name:'Wood handcart',at:KB,mode:'road',width:40},
  {id:'cargo-bicycle',name:'Cargo bicycle',at:2*KB,mode:'road',width:43},
  {id:'cargo-trike',name:'Cargo tricycle',at:4*KB,mode:'road',width:46},
  {id:'scooter',name:'Delivery scooter',at:8*KB,mode:'road',width:49},
  {id:'microvan',name:'Microvan',at:16*KB,mode:'road',width:52},
  {id:'pickup',name:'Supply pickup',at:32*KB,mode:'road',width:55},
  {id:'cargo-van',name:'Cargo van',at:64*KB,mode:'road',width:58},
  {id:'box-truck',name:'Box truck',at:128*KB,mode:'road',width:62},
  {id:'rigid-truck',name:'Heavy truck',at:256*KB,mode:'road',width:66},
  {id:'semi',name:'Semi trailer',at:512*KB,mode:'road',width:71},
  {id:'double-semi',name:'Double trailer',at:MB,mode:'road',width:77},
  {id:'freight-train',name:'Freight train',at:2*MB,mode:'rail',width:84},
  {id:'helicopter',name:'Cargo helicopter',at:4*MB,mode:'air',width:90},
  {id:'tiltrotor',name:'Heavy lift tiltrotor',at:8*MB,mode:'air',width:96},
  {id:'cargo-plane',name:'Cargo plane',at:16*MB,mode:'air',width:102},
  {id:'cargo-jet',name:'Jumbo cargo jet',at:32*MB,mode:'air',width:110},
  {id:'barge',name:'Supply barge',at:64*MB,mode:'water',width:118},
  {id:'freighter',name:'Container ship',at:128*MB,mode:'water',width:128},
  {id:'mega-ship',name:'Space-age cargo ship',at:256*MB,mode:'water',width:140}
];
const aliases={bicycle:'handcart',truck:'pickup',plane:'cargo-plane'};
export function transportSpec(type) {
  return VEHICLE_STAGES.find(s=>s.id===(aliases[type]||type))||VEHICLE_STAGES[0];
}
function wheel(x,y,r=3) {
  return `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#385065"/><g class="wheel-spokes"><path d="M-${r-1} 0h${2*r-2}M0-${r-1}v${2*r-2}" stroke="#e8eff2" stroke-width=".8"/></g></g>`;
}
function crate(x,y,w=10,h=9,color='#e7bf81') {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${color}"/><path d="M${x+1} ${y+1}l${w-2} ${h-2}m0-${h-2}l-${w-2} ${h-2}"/></g>`;
}
function containers(x,y,columns,rows,w=14) {
  let cargo='';
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const px=x+col*(w+1),py=y-row*9;
    cargo+=`<rect x="${px}" y="${py}" width="${w}" height="8" rx="1" fill="${['#a9cddd','#eac29b','#b5d3a5'][(row+col)%3]}"/><path d="M${px+4} ${py+2}v4m4-4v4"/>`;
  }
  return cargo;
}
export function vehicle(type,incoming=false) {
  const spec=transportSpec(type),i=VEHICLE_STAGES.indexOf(spec),w=spec.width;
  const color=incoming?'#a8d3e5':'#b5d5ba',glass='#f3fbff';
  let body='',cargo='';
  if(i<=1) {
    body=`<g transform="translate(-14 8)">${worker({woman:incoming,color:incoming?'#83c1d3':'#eaa88e'})}</g><path d="M-10 0H0M-1-2h${i?23:17}l-3 9H2z" fill="#dec095"/>${wheel(i?5:14,9)}${i?wheel(18,9):''}`;
    cargo=crate(1,-10,i?18:11,8);
  } else if(i<=4) {
    body=`${wheel(-15,8,5)}${wheel(17,8,5)}<path d="M-15 8-5-6 4 8h-19l8-12h21l3 12M-8-6h8M10-8h7v4" fill="${i===4?color:'none'}"/><g transform="translate(-3 1) scale(.8)">${worker({woman:incoming,color:'#e6ab87'})}</g>`;
    if(i>=3)body+=`<path d="M-23-5h14V7h-14z" fill="${color}"/>${wheel(-23,8,3)}`;
    if(i===4)body+=`<path d="M5 3q7-14 13-6l6 10H5z" fill="${color}"/><path d="M19-5v-6h-4"/>`;
    cargo=crate(i>=3?-22:-23,-14,i>=3?12:10,9);
  } else if(i<=11) {
    const left=-w/2+2,right=w/2-2,cab=right-18;
    body=`<path d="M${left} 6V-8h${cab-left}v-7h10l8 10V6z" fill="${color}"/><path d="M${cab+3}-13h6l6 8h-12z" fill="${glass}"/><path d="M${cab+2} 0h4M${left} 7h${w-4}"/>${wheel(left+9,8)}${wheel(right-8,8)}`;
    if(i===5||i===7)body+=`<path d="M${left}-8v-9h${cab-left}v24" fill="${color}"/><path d="M${left+4}-13h${cab-left-8}v6h-${cab-left-8}z" fill="${glass}"/>`;
    cargo=containers(left+2,-6,Math.max(1,Math.floor((cab-left-3)/12)),i>=8?2:1,11);
    if(i>=8)body+=`<path d="M${left}-8v-15h${cab-left-2}v30H${left}z" fill="#f2e6cd"/><path d="M${left+3}-19h${cab-left-8}" stroke="#b4cbcf"/>`;
    if(i>=9)body+=wheel(left+18,8)+wheel(right-17,8);
    if(i>=10)body+=`<path d="M${cab-5}-22v29M${cab-3}-18v18"/>`;
    if(i===11)body+=`<path d="M${left+25}-21V7"/>${wheel(left+30,8)}`;
  } else if(i===12) {
    body=`<path d="M-41 9h82" stroke="#9ab9c2"/><path d="M15 6v-22h16v11h8v11z" fill="${color}"/><path d="M18-13h10v7H18z" fill="${glass}"/><path d="M33-15v-6h4v16"/>${wheel(22,8)}${wheel(34,8)}`;
    for(const x of [-39,-13])body+=`<path d="M${x} 4h24v3h-24z" fill="#dcc098"/>${wheel(x+5,8)}${wheel(x+19,8)}`;
    cargo=containers(-38,-13,2,2,11)+containers(-12,-13,2,2,11);
  } else if(i===13||i===14) {
    body=`<path d="M-26-7h40q22 0 23 13H-7z" fill="${color}"/><path d="M14-6q13 0 18 9H14z" fill="${glass}"/><path d="M-10 0-38-11h-5l4 14h29M-14 7v8h34M-9 15h34" fill="#dce9e9"/>`;
    if(i===13)body+=`<path d="M-1-7v-7"/><path class="vehicle-rotor" d="M-41-15h80" stroke-width="2"/>`;
    else body+=`<path d="M-20-8h42v-4h-42z" fill="#d6e6b0"/><g class="vehicle-rotor"><path d="M-32-17h24M15-17h24" stroke-width="2"/></g><path d="M-20-17v10M27-17v12"/>`;
    cargo=`<path d="M-3 7v12M14 7v12"/>`+crate(-9,19,29,12);
  } else if(i===15||i===16) {
    const length=i===15?46:51;
    body=`<path d="M-${length}-4h${length+13}q28 0 ${length-12} 7-10 6-${length-12} 6H-${length}z" fill="#e8f2f6"/><path d="M-7-4-28-25h12L18-4M-7 9-28 27h12L18 9" fill="#cce2b0"/><path d="M-${length-5}-4-40-19h9l16 15" fill="#e8b59b"/><path d="M25-2h9l7 5H25z" fill="${glass}"/><path d="M-28 2h42" stroke-dasharray="3 5"/>`;
    if(i===15)body+=`<path class="plane-propeller" d="M46-8v22"/>`;
    else body+=`<path d="M-14-15h15v7h-15zM-14 16H1v7h-15z" fill="#9ec4d5"/>`;
    cargo=crate(-9,10,21,9);
  } else {
    const half=w/2-2;
    body=`<path d="M-${half} 1h${w-4}l-12 13H-${half-11}z" fill="${i===19?'#accfdf':'#bdd9e1'}"/><path d="M-${half-6} 8h${w-17}"/><path d="M-${half-6}-17h15V1h-15z" fill="#fff0d5"/><path d="M-${half-4}-13h10v4h-10z" fill="${glass}"/><path d="M-${half-1}-17v-8h6v8" fill="#e7b296"/><path class="ship-wake" d="M-${half} 18q10 4 20 0t20 0t20 0t20 0t20 0" stroke="#b0d8e1"/>`;
    cargo=containers(-half+24,-7,i===17?4:5,i===17?2:i===18?3:4,i===19?18:15);
    if(i===19)body+=`<path d="M-52-18v-15h13v15" fill="#c8e5ed"/><ellipse cx="-45" cy="-34" rx="17" ry="4" fill="#d8e9b6"/><path d="M45 1v-19h11V1" fill="#d2e6ef"/><path d="M45-17h11" stroke="#8cb8c8"/>`;
  }
  const legacyClass=i===1?'supply-pushcart':i===6?'supply-pickup':i===15?'supply-plane':`supply-${spec.id}`;
  return `<g class="${legacyClass}" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}<g class="vehicle-cargo">${cargo}</g></g>`;
}

import {illustratedVehicle,illustratedWorker} from './illustration-art.js';
import {illustratedTruck} from './truck-art.js';

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
export function vehicle(type,incoming=false,appearance) {
  const spec=transportSpec(type),i=VEHICLE_STAGES.indexOf(spec);
  const seed=Number.isFinite(appearance)?Math.abs(Math.floor(appearance)):i+(incoming?0:3);
  const {body,cargo}=i>=5&&i<=11?illustratedTruck(spec,seed):illustratedVehicle(spec,seed);
  const handler=i<=1?`<g class="cart-handler" transform="translate(${i===0?-spec.width/2+3:spec.width/2-2} 11)">${illustratedWorker({woman:incoming})}</g>`:'';
  const legacyClass=i===1?'supply-pushcart':i===6?'supply-pickup':i===15?'supply-plane':`supply-${spec.id}`;
  return `<g class="${legacyClass}" stroke="#385065" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}<g class="vehicle-cargo">${cargo}</g>${handler}</g>`;
}

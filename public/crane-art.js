// Imagegen originals with individually registered sheave/trolley contacts.
// Coordinates are fractions of each complete transparent PNG, not its alpha box.
export const CRANE_ART=[
  {id:'timber-derrick',size:[1217,1293],contact:[.944,.179],height:.66},
  {id:'sage-jib',size:[1295,1214],contact:[.923,.153],height:.69},
  {id:'teal-spider',size:[1312,1199],contact:[.953,.132],height:.76},
  {id:'coral-truck',size:[1312,1199],contact:[.941,.16],height:.80},
  {id:'cobalt-mobile',size:[1312,1199],contact:[.96,.164],height:.88},
  {id:'orange-crawler',size:[1235,1274],contact:[.96,.135],height:.94},
  {id:'ivory-tower',size:[1374,1145],contact:[.96,.285],height:1},
  {id:'purple-luffing',size:[1230,1278],contact:[.947,.078],height:1},
  {id:'mint-gantry',size:[1536,1024],contact:[.747,.294],height:.88},
  {id:'red-heavy-lift',size:[1227,1282],contact:[.974,.093],height:1},
  {id:'ochre-tower',file:'artwork/living/crane.png',size:[1024,1536],contact:[.797,.207],height:1}
];
export const CRANE_ASSETS=['crane-art.js',...CRANE_ART.map(art=>art.file||`artwork/cranes/${art.id}.png`)];

export function craneForSite(stage,index=0,key='catalog') {
  // A fixed per-city permutation gives neighbors different equipment and keeps
  // selections steady through polling, sorting, resizing and measured growth.
  let seed=0;for(const char of String(key))seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;
  const pool=stage<4?[0,1]:stage<8?[0,1,2,3,4,5]:stage<11?[2,3,4,5,6,7,10]:[2,3,4,5,6,7,8,9,10];
  return CRANE_ART[pool[(seed+index)%pool.length]];
}

export function craneArtwork(art,maxHeight,baseline=190) {
  const [sw,sh]=art.size,h=maxHeight*art.height,w=h*sw/sh;
  const x=(art.contact[0]-.5)*w,y=baseline-h+art.contact[1]*h;
  return {id:art.id,image:`<image class="living-crane-pixels" data-crane-design="${art.id}" href="${art.file||`artwork/cranes/${art.id}.png`}" x="${-w/2}" y="${baseline-h}" width="${w}" height="${h}"/>`,
    rig:{x,y,rest:Math.min(h*.43,baseline-y-12),lift:h*.05,loadHeight:12}};
}

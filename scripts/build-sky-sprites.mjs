// Package generated pixels as small alpha-preserving animation textures.
import {app,nativeImage} from 'electron';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const folder=resolve('public/artwork/world/sky');
app.whenReady().then(async()=>{
  const frames={};
  const packageSprite=async(id,image,width)=>{
    const size=image.getSize(),pixels=image.toBitmap();let left=size.width,top=size.height,right=0,bottom=0;
    for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++)if(pixels[(y*size.width+x)*4+3]>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    const x=Math.max(0,left-3),y=Math.max(0,top-3),w=Math.min(size.width,right+4)-x,h=Math.min(size.height,bottom+4)-y;
    const sprite=image.crop({x,y,width:w,height:h}).resize({width,quality:'best'});
    await writeFile(resolve(folder,id+'-v1.png'),sprite.toPNG());
    frames[id]={file:`artwork/world/sky/${id}-v1.png`,sourceBox:[x,y,w,h],size:sprite.getSize()};
  };
  for(const id of ['kite','birds','drone','ufo','cloud'])await packageSprite(id,nativeImage.createFromPath(resolve(folder,id+'-source-v1.png')),id==='birds'?384:id==='cloud'?320:192);
  const celestial=nativeImage.createFromPath(resolve(folder,'celestial-source-v1.png')),size=celestial.getSize(),cell=Math.floor(size.width/3);
  for(const [i,id] of ['sun','moon','star'].entries())await packageSprite(id,celestial.crop({x:i*cell,y:0,width:i===2?size.width-2*cell:cell,height:size.height}),id==='star'?48:96);
  await writeFile(resolve(folder,'frames.js'),'// Cropped imagegen artwork; source pixels remain available beside these textures.\nexport const SKY_ART='+JSON.stringify(frames,null,2)+';\n');
  console.log('SKY_SPRITES_PACKAGED '+JSON.stringify(frames));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});

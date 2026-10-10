// Run with Electron after remeasuring source atlases. Produce small, isolated
// animation textures so a work pose does not repaint an entire sprite sheet.
import {app,nativeImage} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PROP_ART,CONSTRUCTION_ART,FLEET_ART} from '../public/artwork/manifest.js';
import {TRUCK_ART} from '../public/truck-art.js';
app.whenReady().then(async()=>{
  for(const [folder,id,art,width] of [['fleet','crew',PROP_ART.crew,96],...Object.entries(CONSTRUCTION_ART).map(([id,art])=>['construction',id,art,256])]) {
    const image=nativeImage.createFromPath(resolve('public/artwork',folder,id+'.png'));
    await mkdir(resolve('public/artwork',folder,'activity'),{recursive:true});
    for(const [i,[x,y,w,h]] of art.frames.entries()) {
      const frame=image.crop({x:x-2,y:y-2,width:w+4,height:h+4}).resize({width,quality:'best'});
      await writeFile(resolve('public/artwork',folder,'activity',`${id}-${i}.png`),frame.toPNG());
    }
  }
  // Bound traffic textures to the displayed frame. Full multi-megapixel atlases
  // inside every moving SVG make raster work grow with every passing vehicle.
  for(const [folder,table] of [['trucks',TRUCK_ART],['fleet',FLEET_ART]])for(const [id,art] of Object.entries(table)) {
    await mkdir(resolve('public/artwork',folder,'traffic'),{recursive:true});
    for(const [suffix,strip] of [['',art],...(art.empty?[['-empty',art.empty]]:[])]) {
      const source=nativeImage.createFromPath(resolve('public/artwork',folder,id+suffix+'.png'));
      for(const [i,[x,y,w,h]] of strip.frames.entries()) {
        const crop=source.crop({x:x-2,y:y-2,width:w+4,height:h+4});
        const pixels=crop.toBitmap(),clip=strip.clips?.[i],size=crop.getSize();
        if(clip)for(let row=0;row<size.height;row++)for(let column=0;column<size.width;column++) {
          const sx=x-2+column,sy=y-2+row;
          if(sx<clip[0]||sy<clip[1]||sx>=clip[0]+clip[2]||sy>=clip[1]+clip[3])pixels[(row*size.width+column)*4+3]=0;
        }
        const frame=nativeImage.createFromBitmap(pixels,size).resize({width:192,quality:'best'});
        await writeFile(resolve('public/artwork',folder,'traffic',`${id}${suffix}-${i}.png`),frame.toPNG());
      }
    }
  }
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});

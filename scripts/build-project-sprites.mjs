// Measure imagegen alpha, register phase baselines, and isolate runtime textures.
// Original atlases remain intact; this only crops/resizes their original pixels.
import {app,nativeImage} from 'electron';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('public/artwork/construction/projects');
app.setPath('userData',resolve('test-results/project-sprite-profile'));
app.whenReady().then(async()=>{
await mkdir(resolve(root,'textures'),{recursive:true});
function source(name){
  const img=nativeImage.createFromPath(resolve(root,name+(name==='logistics'?'-v2.png':'-v1.png'))),size=img.getSize(),rgba=img.toBitmap();
  const alpha=(x,y)=>rgba[(y*size.width+x)*4+3];
  let clear=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]===0)clear++;console.log(name+' transparent '+(clear/(size.width*size.height)).toFixed(3));
  return {img,size,alpha};
}
function rows(src,count){
  const {width,height}=src.size,edges=[0];
  for(let row=1;row<count;row++){
    let best=Infinity,edge=Math.round(height*row/count);
    for(let y=Math.floor(height*(row-.25)/count);y<height*(row+.25)/count;y++){
      let sum=0;for(let x=0;x<width;x++)if(src.alpha(x,y)>96)sum++;
      const score=sum+Math.abs(y-height*row/count)*.02;
      if(score<best){best=score;edge=y;}
    }
    edges.push(edge);
  }
  edges.push(height);return edges;
}
function bounds(src,left,top,right,bottom){
  let x0=right,y0=bottom,x1=left,y1=top;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(src.alpha(x,y)>64){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  return {x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
}
async function texture(src,box,name){
  const file='artwork/construction/projects/textures/'+name+'.png';
  const image=src.img.crop(box).resize({width:256,quality:'best'});
  await writeFile(resolve('public',file),image.toPNG());
  const {width,height}=image.getSize();return {file,box:[0,0,width,height],source:[width,height]};
}
const projects=[];
for(const family of ['rural','residential','civic','metropolitan','future']){
  const src=source(family),edges=rows(src,4);
  for(let row=0;row<4;row++){
    const boxes=Array.from({length:4},(_,col)=>bounds(src,Math.round(col*src.size.width/4),edges[row],Math.round((col+1)*src.size.width/4),edges[row+1]));
    const sharedWidth=Math.max(...boxes.map(b=>b.width)),sharedHeight=Math.min(edges[row+1]-edges[row],Math.max(...boxes.map(b=>b.height)));
    const frames=[];
    for(let col=0;col<4;col++){
      const b=boxes[col],left=Math.max(0,Math.min(src.size.width-sharedWidth,Math.round(b.x+b.width/2-sharedWidth/2)));
      const top=Math.max(edges[row],Math.min(edges[row+1]-sharedHeight,b.y+b.height-sharedHeight));
      frames.push(await texture(src,{x:left,y:top,width:sharedWidth,height:sharedHeight},family+'-'+row+'-'+col));
    }
    projects.push({family,row,frames});
  }
  console.log(family+' rows '+edges.join(','));
}
const logistics={};
for(const [name,columns,ids] of [['materials',4,['bricks','wood','steel','glass','pipes','wires','concrete','panels']],['logistics',3,['rail-gantry','dock-pier','forklift','dock-worker','bricklayer','material-trolley']]]){
  const src=source(name),edges=rows(src,2);
  for(let i=0;i<ids.length;i++){
    const row=Math.floor(i/columns),col=i%columns;
    const box=bounds(src,Math.round(col*src.size.width/columns),edges[row],Math.round((col+1)*src.size.width/columns),edges[row+1]);
    logistics[ids[i]]=await texture(src,box,ids[i]);
    const rig=ids[i]==='rail-gantry'?[312,120]:ids[i]==='dock-pier'?[590,56]:null;
    if(rig)logistics[ids[i]].rig={x:(rig[0]-box.x)/box.width,y:(rig[1]-box.y)/box.height};
  }
}
await writeFile(resolve(root,'frames.js'),'// Generated alpha measurements and registered runtime textures.\nexport const PROJECT_FRAMES='+JSON.stringify(projects)+';\nexport const LOGISTICS_FRAMES='+JSON.stringify(logistics)+';\n');
app.quit();
}).catch(error=>{console.error(error);app.exit(1);});

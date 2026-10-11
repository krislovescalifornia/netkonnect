// Retained painter for the city's SVG scene model. The model remains the single
// source for measured growth, layout and deliveries; only painting moves here.
// SVG layout and CSS animation layers stay out of the per-frame painting path.
const images=new Map();
const NS='http://www.w3.org/2000/svg';
const numbers=value=>(value||'').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number)||[];
const lerp=(p,points)=>{for(let i=1;i<points.length;i++)if(p<=points[i][0]){const [a,x]=points[i-1],[b,y]=points[i];return x+(y-x)*(p-a)/(b-a);}return points.at(-1)[1];};
const patrol=p=>lerp(p,[[0,0],[.08,0],[.44,-1],[.56,-1],[.92,0],[1,0]]);
const phase=(time,duration,delay=0)=>((time/1000-delay)%duration+duration)%duration/duration;
const motionClasses=new Set(['resident-walk','crew-walker','living-cycle-route','living-transit','crew-carrier','resident-facing','site-vehicle','machine-facing','crane-load','crane-cable','living-foliage','world-cloud','sky-bob','transfer-carrier','transfer-installer','terminal-worker','worksite-dust','worksite-sparks','beacon-flash','world-stars','illustrated-site-machine']);
function matrix(value){
  if(!value)return null;
  const result=new DOMMatrix();
  transform({transform:(...n)=>result.multiplySelf(new DOMMatrix(n)),translate:(x,y)=>result.translateSelf(x,y),scale:(x,y)=>result.scaleSelf(x,y),rotate:r=>result.rotateSelf(r*180/Math.PI)},value);
  return result;
}
function transform(ctx,value) {
  for(const [,name,args] of (value||'').matchAll(/([a-zA-Z]+)\(([^)]+)\)/g)) {
    const n=numbers(args);
    if(name==='matrix')ctx.transform(...n);
    else if(name==='translate')ctx.translate(n[0],n[1]||0);
    else if(name==='translateX')ctx.translate(n[0],0);
    else if(name==='translateY')ctx.translate(0,n[0]);
    else if(name==='scale')ctx.scale(n[0],n[1]??n[0]);
    else if(name==='scaleX')ctx.scale(n[0],1);
    else if(name==='scaleY')ctx.scale(1,n[0]);
    else if(name==='rotate'){ctx.translate(n[1]||0,n[2]||0);ctx.rotate(n[0]*Math.PI/180);ctx.translate(-n[1]||0,-n[2]||0);}
  }
}
function asset(url,ready) {
  let image=images.get(url);
  if(!image){image=new Image();image.src=url;images.set(url,image);if(images.size>64)images.delete(images.keys().next().value);}
  if(!image.complete)image.addEventListener('load',ready,{once:true});
  return image;
}

export class CityCanvas {
  constructor(svg,invalidate) {
    this.svg=svg;this.invalidate=invalidate;this.nodes=new WeakMap();this.time=0;this.workTime=0;this.lastTime=0;this.imageVersion=0;
    this.surface=document.createElementNS(NS,'foreignObject');this.surface.setAttribute('class','city-canvas-surface');
    this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');
    this.canvas.style.cssText='width:100%;height:100%;display:block';this.surface.append(this.canvas);
    this.ctx=this.canvas.getContext('2d',{alpha:true});
    if(!this.ctx)throw new Error('Canvas 2D unavailable');
    svg.append(this.surface);svg.classList.add('canvas-city');
    this.observer=new MutationObserver(records=>this.changes(records));
    this.observer.observe(svg,{subtree:true,attributes:true,childList:true});
    this.root=this.compile(svg);this.repaints=0;
  }
  destroy(){this.observer.disconnect();if(this.pendingImagePaint)cancelAnimationFrame(this.pendingImagePaint);this.surface.remove();this.canvas.width=0;this.svg.classList.remove('canvas-city');}
  changes(records) {
    for(const change of records) {
      if(change.target===this.surface||this.surface.contains(change.target))continue;
      const n=this.nodes.get(change.target);if(!n)continue;
      if(change.type==='childList'){n.children=[...change.target.children].filter(e=>e!==this.surface).map(e=>this.compile(e));for(const child of n.children)child.parent=n;this.dirty(n);}
      else {
        const value=change.target.getAttribute(change.attributeName);
        if(n.attrs[change.attributeName]===value)continue;
        const previous=n.attrs[change.attributeName];
        // Delivery pulses do not affect this painter's static scenery. Resting
        // changes do affect worksite visibility; lighting changes affect all art.
        if(n===this.root&&change.attributeName==='class'&&String(previous).includes('city-resting')===String(value).includes('city-resting')){n.attrs.class=value;continue;}
        this.dirty(n);
        n.attrs[change.attributeName]=value;
        if(['style','class','data-time'].includes(change.attributeName))this.refresh(n);
        else if(change.attributeName==='opacity'){
          n.style.opacity=value===null?1:Number(value);
          if(n.has('material-transfer')||n.has('transfer-carrier')||n.has('transfer-installer'))n.style.visibility=Number(value)===0?'hidden':'visible';
        }
        else if(!change.attributeName.startsWith('data-'))this.geometry(n);
      }
    }
  }
  compile(el) {
    if(this.nodes.has(el))return this.nodes.get(el);
    const n={el,tag:el.localName,attrs:Object.fromEntries([...el.attributes].map(a=>[a.name,a.value])),children:[]};this.nodes.set(el,n);
    this.style(n);this.geometry(n);
    n.children=[...el.children].filter(e=>e!==this.surface).map(e=>this.compile(e));for(const child of n.children)child.parent=n;return n;
  }
  dirty(n){for(let node=n;node;node=node.parent)node.cache=null;}
  refresh(n){n.cache=null;this.style(n);this.geometry(n);for(const child of n.children)this.refresh(child);}
  style(n) {
    const s=getComputedStyle(n.el),prop=name=>parseFloat(s.getPropertyValue('--'+name))||0;
    n.style={opacity:Number(s.opacity),fill:s.fill,stroke:s.stroke,strokeWidth:parseFloat(s.strokeWidth)||0,visibility:s.visibility,
      transform:n.el.style.transform,clip:s.clipPath,filter:s.filter};
    n.classes=new Set(n.el.classList);n.has=c=>n.classes.has(c);
    n.motion=[...n.classes].some(c=>motionClasses.has(c));
    n.animatedOpacity=n.has('worksite-dust')||n.has('worksite-sparks');
    n.vars=Object.fromEntries(['walk-duration','walk-delay','walk-distance','stride-delay','pose-delay','machine-duration','machine-delay','yard-span','hoist-duration','hoist-delay','hoist-rest','hoist-lift','nature-delay','cloud-delay','cloud-duration','work-delay'].map(k=>[k,prop(k)]));
    n.work=!!n.el.closest('.construction-yard,.city-helpers,.crew-carrier,.crew-receiver,.crane-rig,.transfer-installer,.transfer-carrier');
    n.cacheable=['city-buildings','world-infrastructure','world-terrain','terminal-art','world-air-terminal'].some(n.has);
    n.gardener=!!n.el.closest('.living-gardener');n.tram=!!n.el.closest('.living-transit');
    n.terminalActive=!!n.el.closest('.terminal-unloading');
    n.clipNode=n.style.clip.includes('#')?this.svg.querySelector('[id="'+n.style.clip.split('#')[1].split('"')[0].split(')')[0]+'"]'):null;
  }
  geometry(n) {
    const a=n.attrs;n.x=Number(a.x)||0;n.y=Number(a.y)||0;n.w=Number(a.width)||0;n.h=Number(a.height)||0;
    n.matrix=matrix(n.style.transform||a.transform);n.view=numbers(a.viewBox);
    if(n.tag==='image'&&n.url!==a.href){n.url=a.href;n.image=asset(a.href,()=>{this.imageVersion++;if(this.svg.isConnected&&!this.pendingImagePaint){this.pendingImagePaint=requestAnimationFrame(()=>{this.pendingImagePaint=null;this.invalidate();});}});}
    const p=new Path2D();
    if(n.tag==='path'){try{n.path=new Path2D(a.d||'');}catch{n.path=p;}return;}
    if(n.tag==='rect')p.roundRect(n.x,n.y,Math.max(0,n.w),Math.max(0,n.h),Math.min(Number(a.rx)||0,n.w/2,n.h/2));
    if(n.tag==='circle')p.arc(Number(a.cx)||0,Number(a.cy)||0,Math.max(0,Number(a.r)||0),0,Math.PI*2);
    if(n.tag==='ellipse')p.ellipse(Number(a.cx)||0,Number(a.cy)||0,Math.max(0,Number(a.rx)||0),Math.max(0,Number(a.ry)||0),0,0,Math.PI*2);
    if(n.tag==='line'){p.moveTo(Number(a.x1)||0,Number(a.y1)||0);p.lineTo(Number(a.x2)||0,Number(a.y2)||0);}
    if(['polygon','polyline'].includes(n.tag)){const v=numbers(a.points);for(let i=0;i<v.length;i+=2)i?p.lineTo(v[i],v[i+1]):p.moveTo(v[i],v[i+1]);if(n.tag==='polygon')p.closePath();}
    n.path=p;
  }
  animate(n,ctx,time) {
    if(!n.motion)return;
    const v=n.vars,has=n.has,t=n.work?this.workTime:time;
    const p=phase(t,v['walk-duration']||12,v['walk-delay']);
    if(has('resident-walk')||has('crew-walker')||has('living-cycle-route')||has('living-transit')||has('crew-carrier'))ctx.translate(patrol(p)*(v['walk-distance']||80),0);
    if(has('resident-facing'))ctx.scale(p<.56?-1:1,1);
    if(has('site-vehicle')){const q=phase(t,v['machine-duration']||9,v['machine-delay']),span=v['yard-span']||30;ctx.translate(lerp(q,[[0,-30],[.1,-30],[.3,span*.3],[.42,span*.3],[.62,span],[.78,span],[.9,-5],[1,-30]]),lerp(q,[[0,4],[.1,4],[.3,-16],[.42,-16],[.62,-6],[.78,-6],[.9,-10],[1,4]]));}
    if(has('machine-facing'))ctx.scale(phase(t,v['machine-duration']||9,v['machine-delay'])<.78?1:-1,1);
    if(has('crane-load')||has('crane-cable')){const q=phase(this.workTime,v['hoist-duration']||10,v['hoist-delay']);const h=lerp(q,[[0,v['hoist-rest']],[.4,v['hoist-lift']],[.62,v['hoist-lift']],[1,v['hoist-rest']]]);has('crane-load')?ctx.translate(0,h):ctx.scale(1,h);}
    if(has('living-foliage')){const box=n.children[0],x=box?box.x+box.w/2:0,y=box?box.y+box.h:0;ctx.translate(x,y);ctx.rotate(Math.sin((t/1000-v['nature-delay'])/5.3*Math.PI)*Math.PI/180);ctx.translate(-x,-y);}
    if(has('world-cloud'))ctx.translate(12.5-42.5*Math.cos((t/1000-v['cloud-delay'])/(v['cloud-duration']||65)*Math.PI),0);
    if(has('sky-bob')){const y=Math.sin(t/6700*Math.PI);ctx.translate(0,y);ctx.rotate(y*Math.PI/180);}
    if(has('transfer-carrier'))ctx.translate(0,-.7*(.5-.5*Math.cos(t/650*Math.PI)));
    if(has('transfer-installer'))ctx.rotate(Math.sin(t/1700*Math.PI*2)*.06);
    if(has('terminal-worker')){
      if(n.terminalActive)n.terminalTime=(n.terminalTime||0)+Math.max(0,time-(n.lastTerminalTime??time));
      n.lastTerminalTime=time;ctx.translate(0,-.5+.5*Math.cos((n.terminalTime||0)/2000*Math.PI*2));
    }
    if(has('worksite-dust'))ctx.globalAlpha*=this.working?.25*(1-Math.cos(t/1900*Math.PI)):0;
    if(has('worksite-sparks'))ctx.globalAlpha*=this.working?Math.max(0,Math.sin(t/1400*Math.PI))*.85:0;
    if(has('beacon-flash')||has('world-stars'))ctx.globalAlpha*=.725-.275*Math.cos(t/2500*Math.PI*2);
    if(has('illustrated-site-machine'))ctx.rotate(Math.sin(t/1900*Math.PI)*.04);
  }
  drawNode(n,ctx,time,uncached=false) {
    const s=n.style;
    if(['defs','title','desc','clipPath','foreignObject'].includes(n.tag)||s.visibility==='hidden'||(s.opacity===0&&!n.animatedOpacity))return;
    if(n.cacheable&&!uncached){
      const matrix=ctx.getTransform(),key=[...matrix.toFloat64Array(),ctx.globalAlpha,this.canvas.width,this.canvas.height,this.imageVersion].join(',');
      if(n.cache?.key!==key){const bitmap=new OffscreenCanvas(this.canvas.width,this.canvas.height),paint=bitmap.getContext('2d');paint.setTransform(matrix);paint.globalAlpha=ctx.globalAlpha;this.drawNode(n,paint,time,true);n.cache={key,bitmap};}
      ctx.save();ctx.resetTransform();ctx.globalAlpha=1;ctx.drawImage(n.cache.bitmap,0,0);ctx.restore();return;
    }
    ctx.save();ctx.globalAlpha*=n.animatedOpacity?1:s.opacity;
    if(n.matrix){const {a,b,c,d,e,f}=n.matrix;ctx.transform(a,b,c,d,e,f);}this.animate(n,ctx,time);
    if(s.filter&&s.filter!=='none')ctx.filter=s.filter;
    if(n.clipNode){const clip=this.nodes.get(n.clipNode);if(clip?.children[0])ctx.clip(clip.children[0].path);}
    if(n.has('foundation-bricks')&&s.clip.startsWith('inset(')){
      const image=n.children[0],inset=numbers(s.clip)[1]||0;
      if(image){ctx.beginPath();ctx.rect(image.x,image.y,image.w*(1-inset/100),image.h);ctx.clip();}
    }
    if(n.tag==='svg'&&n!==this.root){
      ctx.translate(n.x,n.y);ctx.beginPath();ctx.rect(0,0,n.w,n.h);ctx.clip();
      if(n.view.length===4){const [x,y,w,h]=n.view;let sx=n.w/w,sy=n.h/h;if(n.attrs.preserveAspectRatio!=='none'){const scale=Math.min(sx,sy);ctx.translate((n.w-w*scale)/2,(n.h-h*scale)/2);sx=sy=scale;}ctx.scale(sx,sy);ctx.translate(-x,-y);}
    }
    if(n.tag==='image'&&n.image?.complete&&n.image.naturalWidth&&n.w&&n.h){
      let x=n.x;
      if(n.has('resident-stride'))x-=Math.floor(phase(time,.8,n.vars['stride-delay'])*4)*384;
      if(n.has('living-pose'))x-=Math.floor(phase(n.work?this.workTime:time,n.gardener?2:n.tram?1.8:1.2,n.vars['pose-delay'])*4)*384;
      // Crop at the source: drawing entire four-pose atlases wastes texture work.
      const image=n.image,ratioX=image.naturalWidth/n.w,ratioY=image.naturalHeight/n.h;
      const parent=n.parent,box=parent?.tag==='svg'?parent.view:null;
      if(box?.length===4){const [bx,by,bw,bh]=box,left=Math.max(x,bx),top=Math.max(n.y,by),right=Math.min(x+n.w,bx+bw),bottom=Math.min(n.y+n.h,by+bh);if(right>left&&bottom>top)ctx.drawImage(image,(left-x)*ratioX,(top-n.y)*ratioY,(right-left)*ratioX,(bottom-top)*ratioY,left,top,right-left,bottom-top);}
      else ctx.drawImage(image,x,n.y,n.w,n.h);
    } else if(['path','rect','ellipse','circle','line','polygon','polyline'].includes(n.tag)){
      if(s.fill!=='none'){ctx.fillStyle=s.fill;ctx.fill(n.path);}
      if(s.stroke!=='none'&&s.strokeWidth){ctx.strokeStyle=s.stroke;ctx.lineWidth=s.strokeWidth;ctx.stroke(n.path);}
    }
    for(const child of n.children)this.drawNode(child,ctx,time);
    ctx.restore();
  }
  paint(now,size,working) {
    this.changes(this.observer.takeRecords());
    this.working=working;if(working)this.workTime+=Math.max(0,now-this.lastTime);this.lastTime=now;this.time=now;
    const extent=Number(this.svg.dataset.sceneEnd)+245,dpr=Math.min(2,devicePixelRatio||1);
    const w=Math.round(size.width*dpr),h=Math.round(size.height*dpr);
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.surface.setAttribute('x','0');this.surface.setAttribute('y','-20');this.surface.setAttribute('width',extent);this.surface.setAttribute('height','280');}
    const ctx=this.ctx;ctx.resetTransform();ctx.clearRect(0,0,w,h);ctx.scale(w/extent,h/280);ctx.translate(0,20);
    this.drawNode(this.root,ctx,this.time);this.repaints++;
  }
}

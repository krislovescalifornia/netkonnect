// Browser-native QA for the real renderer, usable when Electron cannot launch.
const button=document.createElement('button');
button.id='verify-city';button.textContent='Verify motion and measured growth';
document.querySelector('.controls').append(button);
const output=document.createElement('pre');output.id='city-verification';output.style.cssText='white-space:pre-wrap;font-size:12px;max-width:1300px;margin:12px auto';
document.querySelector('main').append(output);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(value,message)=>{if(!value)throw new Error(message);};
const change=(selector,value)=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));};
const categories=['.resident-walk','.living-cycle-route','.living-transit','.living-gardener .living-pose','.crew-builder .living-pose','.site-vehicle','.crane-load','.living-foliage'];
let previousRun;
function samples() {
  return [...document.querySelectorAll('.application-city')].map(svg=>({stage:+svg.dataset.stage,groups:categories.map(selector=>({selector,items:[...svg.querySelectorAll(selector)].map(el=>({transform:getComputedStyle(el).transform,rect:el.getBoundingClientRect().toJSON(),time:el.getAnimations()[0]?.currentTime}))}))}));
}
function comparison(a,b) {
  return a.map((city,i)=>({stage:city.stage,groups:city.groups.map((group,j)=>({
    selector:group.selector,count:group.items.length,
    changed:group.items.filter((item,k)=>item.transform!==b[i].groups[j].items[k]?.transform).length,
    pixels:Math.max(0,...group.items.map((item,k)=>{const next=b[i].groups[j].items[k];return next?Math.hypot(next.rect.x-item.rect.x,next.rect.y-item.rect.y):0;}))
  }))}));
}
button.onclick=async()=>{
  button.disabled=true;const report={viewport:[innerWidth,innerHeight],started:new Date().toISOString(),checks:[]};
  const checkpoint=(name,data)=>{report.checks.push({name,data});output.textContent=JSON.stringify(report,null,2);};
  try {
    window.livingPreview.setStages([5,6,10]);change('#lighting','12');change('#growth','35');
    if(previousRun) {
      assert(previousRun.svg===document.querySelector('.application-city'),'Resize retains scene');
      assert(previousRun.nodes.every((el,i)=>el.isConnected&&el.getAnimations()[0]===previousRun.animations[i]),'Resize retains actor animations');
      checkpoint('resize continuity',true);
    }
    if(document.querySelector('#motion').textContent==='Resume motion')document.querySelector('#motion').click();
    if(document.querySelector('#traffic').textContent==='Start incoming traffic')document.querySelector('#traffic').click();
    await Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async src=>{const img=new Image();img.src=src;await img.decode();}));
    // Wait for an actual delivery before judging crane loads; unloaded cranes
    // must not be filled with fabricated stock just to make a test pass.
    await wait(18000);
    const nodes=[...document.querySelectorAll('.resident-walk,.living-pose,.site-vehicle,.crane-load')];
    const animations=nodes.map(el=>el.getAnimations()[0]);
    const motion=[];
    for(let i=0;i<3;i++) {
      document.querySelectorAll('.application-city')[i].scrollIntoView({block:'center'});
      await wait(400);const before=samples()[i];let observed;
      // Several uneven samples prevent discrete sprite loops from aliasing.
      for(const delay of [330,470,710]) {
        await wait(delay);const next=comparison([before],[samples()[i]])[0];
        if(!observed)observed=next;
        else next.groups.forEach((group,j)=>{observed.groups[j].changed=Math.max(observed.groups[j].changed,group.changed);observed.groups[j].pixels=Math.max(observed.groups[j].pixels,group.pixels);});
      }
      motion.push(observed);
    }
    for(const city of motion)for(const group of city.groups)if(group.count)assert(group.changed>0,'Visible pose motion: level '+(city.stage+1)+' '+group.selector);
    for(const city of motion) {
      assert(city.groups.find(g=>g.selector==='.site-vehicle').pixels>3,'Machinery travel is perceptible');
      assert(city.groups.find(g=>g.selector==='.resident-walk').pixels>2,'Residents travel visibly');
    }
    checkpoint('rendered movement',motion);
    const scale=[...document.querySelectorAll('.application-city')].map(svg=>({stage:+svg.dataset.stage,person:svg.querySelector('.resident-person').getBoundingClientRect().height,crew:svg.querySelector('.worksite-hauler .illustrated-person').getBoundingClientRect().height,crane:svg.querySelector('.living-crane-pixels').getBoundingClientRect().height}));
    assert(scale.every(s=>s.person>12&&s.crew>12&&s.crane>60),'Near-scale residents, workers and cranes');
    checkpoint('rendered scale',scale);
    const initial=[...document.querySelectorAll('.city-project')].map(el=>+el.dataset.buildProgress);
    document.querySelector('#sort').click();document.querySelector('#sort').click();
    change('#growth','80');await wait(1300);
    assert(nodes.every(el=>el.isConnected),'Growth and sorting retain actors');
    assert(nodes.every((el,i)=>el.getAnimations()[0]===animations[i]),'Growth and sorting retain animation timelines');
    assert([...document.querySelectorAll('.city-project')].every((el,i)=>+el.dataset.buildProgress>initial[i]),'Measured growth advances every parcel');
    assert([...document.querySelectorAll('.city-established')].every(el=>el.getAttribute('opacity')==='1'),'Established architecture remains solid');
    checkpoint('growth and sort continuity',true);
    document.querySelector('#motion').click();await wait(200);
    const p=samples();await wait(1200);const frozen=comparison(p,samples());
    assert(frozen.every(c=>c.groups.every(g=>g.changed===0)),'Pause freezes all motion');
    checkpoint('pause',true);
    document.querySelector('#motion').click();
    document.querySelector('#gallery').classList.add('no-motion');window.livingPreview.render();await wait(200);
    const d=samples();await wait(1200);assert(comparison(d,samples()).every(c=>c.groups.every(g=>g.changed===0)),'Motion setting freezes all motion');
    checkpoint('motion setting',true);
    document.querySelector('#gallery').classList.remove('no-motion');window.livingPreview.render();
    window.livingPreview.setReducedMotion(true);await wait(200);
    const reduced=samples();await wait(1200);
    assert(comparison(reduced,samples()).every(c=>c.groups.every(g=>g.changed===0)),'Reduced preference pauses all actor categories');
    checkpoint('reduced-motion preference input',true);
    window.livingPreview.setReducedMotion(null);
    change('#growth','35');document.querySelector('#traffic').click();await wait(26000);
    const idle=[...document.querySelectorAll('.city-project')].map(el=>el.dataset.buildProgress),resting=[];
    for(let i=0;i<3;i++) {
      document.querySelectorAll('.application-city')[i].scrollIntoView({block:'center'});
      await wait(400);const r=samples()[i];await wait(1500);resting.push(comparison([r],[samples()[i]])[0]);
    }
    assert(resting.every(c=>c.groups.find(g=>g.selector==='.resident-walk').changed>0),'Ambient life remains active without data');
    assert(resting.every(c=>c.groups.filter(g=>['.site-vehicle','.crane-load','.crew-builder .living-pose'].includes(g.selector)).every(g=>g.changed===0)),'Construction waits for incoming data');
    assert(JSON.stringify(idle)===JSON.stringify([...document.querySelectorAll('.city-project')].map(el=>el.dataset.buildProgress)),'Idle time cannot manufacture growth');
    checkpoint('idle separates life from construction',resting);
    document.querySelector('#traffic').click();
    const resident=document.querySelector('.resident-walk'),residentAnimation=resident.getAnimations()[0],svg=document.querySelector('.application-city');
    window.livingPreview.setStages([6,7,11]);await wait(200);
    assert(svg===document.querySelector('.application-city'),'Level transition preserves scene');
    assert(resident.isConnected&&resident.getAnimations()[0]===residentAnimation,'Level transition preserves resident timeline');
    checkpoint('level transition',true);
    window.livingPreview.setStages(Array.from({length:20},(_,i)=>i));
    await Promise.all([...new Set([...document.querySelectorAll('image')].map(el=>el.getAttribute('href')))].map(async src=>{const img=new Image();img.src=src;await img.decode();}));
    assert(document.querySelectorAll('.living-diorama').length===20,'All levels rendered');
    const identities=[...document.querySelectorAll('.living-diorama')].map(el=>el.dataset.place);assert(new Set(identities).size===20,'All level identities update');
    checkpoint('twenty assembled places load offline',identities);
    window.livingPreview.setStages([5,6,10]);
    const retained=[...document.querySelectorAll('.resident-walk,.living-pose,.site-vehicle,.crane-load')];
    previousRun={svg:document.querySelector('.application-city'),nodes:retained,animations:retained.map(el=>el.getAnimations()[0])};
    report.passed=true;report.finished=new Date().toISOString();output.textContent=JSON.stringify(report,null,2);
  }catch(error){report.passed=false;report.error=error.message;output.textContent=JSON.stringify(report,null,2);console.error(error);}
  finally{button.disabled=false;}
};


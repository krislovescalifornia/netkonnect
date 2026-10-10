// Patch live dashboard content without disconnecting the animated scenes.
// Disconnecting an SVG restarts every CSS animation in its subtree.
import {updateCityGrowth} from './cities.js';
const key = node => node.nodeType === 1 && (node.getAttribute('data-render-key') || node.id || node.getAttribute('data-city-key') || node.getAttribute('data-route-key') || node.getAttribute('data-helper'));
const compatible = (a,b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && a.namespaceURI === b.namespaceURI && key(a) === key(b) && (key(a) || a.classList[0] === b.classList[0])));

function attributes(current,next,scene=false) {
  for(const attr of [...current.attributes]) {
    if(scene && ['viewBox','data-scene-end','data-time'].includes(attr.name))continue;
    if(attr.name==='transform'&&current.matches('.city-activity-anchor,.city-route-scene .city-buildings'))continue;
    if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
  }
  for(const attr of next.attributes) {
    if(scene && ['viewBox','data-time'].includes(attr.name))continue;
    if(attr.name==='transform'&&current.matches('.city-activity-anchor,.city-route-scene .city-buildings'))continue;
    let value=attr.value;
    if(scene && attr.name==='class' && current.matches('.convoy-svg')) {
      // Working/resting and deliveries belong to the live journey animator.
      // Do not briefly reset them before a resize flushes style/layout.
      const runtime=['city-working','city-resting','city-delivering'];
      value=[...next.classList].filter(name=>!runtime.includes(name)).concat(runtime.filter(name=>current.classList.contains(name))).join(' ');
    }
    if(current.getAttribute(attr.name) !== value)current.setAttribute(attr.name,value);
  }
}

function patch(current,next) {
  if(current.nodeType !== 1) {
    if(current.nodeValue !== next.nodeValue)current.nodeValue=next.nodeValue;
    return;
  }
  const scene=current.matches('.application-city, .convoy-svg');
  const growth=scene && (current.dataset.stage !== next.dataset.stage || current.dataset.progress !== next.dataset.progress);
  attributes(current,next,scene);
  if(scene) {
    if(growth && current.matches('.application-city')) {
      if(next.querySelector('.city-buildings')) {
        for(const layer of ['.city-buildings','.construction-site','.city-projects','.city-site-vehicles','.city-helpers','.city-residents']) {
          const target=current.querySelector(layer),template=next.querySelector(layer);
          if(target&&template){attributes(target,template);updateChildren(target,template);}
        }
      } else updateCityGrowth(current,Number(next.dataset.stage),Number(next.dataset.progress));
    }
    return;
  }
  updateChildren(current,next);
  // Attribute updates alone do not change dirty form-control properties.
  if(current.tagName === 'INPUT' && current.value !== next.value)current.value=next.value;
  if(current.tagName === 'SELECT' && current.value !== next.value)current.value=next.value;
}

function updateChildren(current,next) {
  const remaining=new Set(current.childNodes);
  let cursor=current.firstChild;
  for(const template of [...next.childNodes]) {
    const match=cursor && compatible(cursor,template) ? cursor : [...remaining].find(node=>compatible(node,template));
    if(match) {
      remaining.delete(match);
      if(match !== cursor) {
        // State-preserving moves keep CSS timelines when application sorting changes.
        if(current.moveBefore && match.isConnected)current.moveBefore(match,cursor);
        else current.insertBefore(match,cursor);
      }
      patch(match,template);
      cursor=match.nextSibling;
    } else current.insertBefore(template,cursor);
  }
  for(const obsolete of remaining)obsolete.remove();
}

export function updateMarkup(root,markup) {
  const template=root.ownerDocument.createElement('template');
  template.innerHTML=markup;
  updateChildren(root,template.content);
}

// Parse in the SVG namespace and retain cloud/bird timelines on layout changes.
export function updateSVGMarkup(root,markup) {
  const template=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
  template.innerHTML=markup;
  updateChildren(root,template);
}

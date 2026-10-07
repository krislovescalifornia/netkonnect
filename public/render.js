// Patch live dashboard content without disconnecting the animated scenes.
// Disconnecting an SVG restarts every CSS animation in its subtree.
const key = node => node.nodeType === 1 && (node.getAttribute('data-render-key') || node.id || node.getAttribute('data-city-key') || node.getAttribute('data-route-key') || node.getAttribute('data-helper'));
const compatible = (a,b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && a.namespaceURI === b.namespaceURI && key(a) === key(b) && (key(a) || a.classList[0] === b.classList[0])));

function attributes(current,next,scene=false) {
  for(const attr of [...current.attributes]) {
    if(scene && ['viewBox','data-scene-end'].includes(attr.name))continue;
    if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
  }
  for(const attr of next.attributes) {
    if(scene && attr.name === 'viewBox')continue;
    if(current.getAttribute(attr.name) !== attr.value)current.setAttribute(attr.name,attr.value);
  }
}

function patch(current,next) {
  if(current.nodeType !== 1) {
    if(current.nodeValue !== next.nodeValue)current.nodeValue=next.nodeValue;
    return;
  }
  const scene=current.matches('.application-city, .convoy-svg');
  const growth=scene && current.dataset.stage !== next.dataset.stage;
  attributes(current,next,scene);
  if(scene) {
    if(growth && current.matches('.application-city')) {
      updateChildren(current.querySelector('.city-buildings'),next.querySelector('.city-buildings'));
      updateChildren(current.querySelector('.city-helpers'),next.querySelector('.city-helpers'));
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
